"""In-memory catalog: loading, lookups and price resolution (promos, clubs, bundles)."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Dict, Iterable, List, Optional

from app.core.config import settings

CATEGORY_LABELS_HE = {
    "fresh": "טרי",
    "protein": "חלבון ובשר",
    "pantry": "יבש ומזווה",
    "snacks": "חטיפים ושתייה",
    "extra": "נלווים ובית",
}

HEVER_CLUB = "hever"   # cross-chain club (חבר / ביחד בשבילך)


@dataclass
class PriceResult:
    """Resolved price for a product at a store, for a given quantity."""
    list_price: float
    unit_price: float
    total: float
    saved: float = 0.0
    promo: Optional[dict] = None
    bundle: Optional[dict] = None
    bundle_hint: Optional[str] = None
    club_id: Optional[str] = None
    blocked_club_promo: Optional[dict] = field(default=None, repr=False)


class Catalog:
    """Loads the seed catalog once and answers every lookup the API needs."""

    def __init__(self) -> None:
        raw = json.loads(settings.products_file.read_text(encoding="utf-8"))
        self.stores: List[dict] = raw["stores"]
        self.clubs: List[dict] = raw.get("clubs", [])
        self.products: List[dict] = raw["products"]
        self.by_gtin: Dict[str, dict] = {p["gtin"]: p for p in self.products}
        self.store_by_id: Dict[str, dict] = {s["id"]: s for s in self.stores}

        self._by_tag: Dict[str, List[dict]] = {}
        for p in self.products:
            for t in p["tags"]:
                self._by_tag.setdefault(t, []).append(p)

        self.recipes_raw = json.loads(settings.recipes_file.read_text(encoding="utf-8"))
        self.recipes: Dict[str, dict] = {r["id"]: r for r in self.recipes_raw["recipes"]}
        self.sides: Dict[str, dict] = {s["id"]: s for s in self.recipes_raw["sides"]}
        self.holidays_raw = json.loads(settings.holidays_file.read_text(encoding="utf-8"))
        self.holidays: Dict[str, dict] = {h["id"]: h for h in self.holidays_raw["presets"]}
        self.seasons: Dict[str, dict] = {s["id"]: s for s in self.holidays_raw["seasons"]}
        self.leftover_ideas: List[dict] = self.holidays_raw["leftover_ideas"]

    # ------------------------------------------------------------------ #
    #  Lookups
    # ------------------------------------------------------------------ #
    def store(self, store_id: str) -> dict:
        if store_id not in self.store_by_id:
            raise KeyError(f"unknown store '{store_id}'")
        return self.store_by_id[store_id]

    def by_tag(self, tag: str) -> List[dict]:
        return list(self._by_tag.get(tag, []))

    def by_category(self, category: str) -> List[dict]:
        return [p for p in self.products if p["category"] == category]

    def search(self, query: str, limit: int = 20) -> List[dict]:
        q = (query or "").strip()
        if not q:
            return []
        if q.isdigit():
            hit = self.by_gtin.get(q)
            return [hit] if hit else []
        words = [w for w in re.split(r"\s+", q) if w]
        scored = []
        for p in self.products:
            hay = f"{p['name']} {p['brand']} {' '.join(p['tags'])}"
            score = sum(3 if w in p["name"] else (2 if w in p["brand"] else (1 if w in hay else 0)) for w in words)
            if score:
                scored.append((score, p["staple_score"], p))
        scored.sort(key=lambda x: (-x[0], -x[1]))
        return [p for _, _, p in scored[:limit]]

    # ------------------------------------------------------------------ #
    #  Pricing
    # ------------------------------------------------------------------ #
    def price(self, product: dict, store_id: str, clubs: Iterable[str] = (), qty: int = 1) -> PriceResult:
        """Resolve the real shelf price: club-aware promos plus multi-buy bundles."""
        clubs = set(clubs or ())
        list_price = float(product["prices"][store_id])
        unit = list_price
        promo = product.get("promos", {}).get(store_id)
        applied_promo, blocked = None, None
        club_id = None

        if promo:
            eligible = (not promo.get("is_club_only")) or (promo.get("club_id") in clubs) or (HEVER_CLUB in clubs)
            if eligible:
                unit = float(promo["promo_price"])
                applied_promo = promo
                club_id = promo.get("club_id") if promo.get("is_club_only") else None
            else:
                blocked = promo

        total = round(unit * qty, 2)
        bundle = product.get("bundles", {}).get(store_id)
        applied_bundle, hint = None, None
        if bundle:
            n = int(bundle["n"])
            if qty >= n:
                groups, rest = divmod(qty, n)
                candidate = round(groups * float(bundle["bundle_price"]) + rest * unit, 2)
                if candidate < total:
                    total, applied_bundle = candidate, bundle
            else:
                # "don't buy 2 at full price when 3 closes the deal"
                missing = n - qty
                step_total = round(float(bundle["bundle_price"]), 2)
                if step_total < round(unit * n, 2):
                    hint = (f"עוד {missing} והמחיר יורד ל-{bundle['effective_unit_price']:.2f} ₪ ליחידה "
                            f"({bundle['description']})")

        saved = round(max(0.0, list_price * qty - total), 2)
        return PriceResult(list_price=list_price, unit_price=unit, total=total, saved=saved,
                           promo=applied_promo, bundle=applied_bundle, bundle_hint=hint,
                           club_id=club_id, blocked_club_promo=blocked)

    def best_store_for(self, product: dict, clubs: Iterable[str] = ()) -> tuple[str, float]:
        best_id, best_price = "", float("inf")
        for store_id in product["prices"]:
            pr = self.price(product, store_id, clubs)
            if pr.unit_price < best_price:
                best_id, best_price = store_id, pr.unit_price
        return best_id, round(best_price, 2)

    # ------------------------------------------------------------------ #
    #  Cart item construction
    # ------------------------------------------------------------------ #
    def to_cart_item(self, product: dict, store_id: str, qty: int = 1, clubs: Iterable[str] = (),
                     locked: bool = False, source: str = "knapsack", note: Optional[str] = None) -> dict:
        pr = self.price(product, store_id, clubs, qty)
        return {
            "gtin": product["gtin"],
            "name": product["name"],
            "brand": product["brand"],
            "category": product["category"],
            "unit_label": product["unit_label"],
            "pack_size": product["pack_size"],
            "pack_unit": product["pack_unit"],
            "qty": qty,
            "list_price": pr.list_price,
            "unit_price": round(pr.unit_price, 2),
            "line_total": pr.total,
            "saved": pr.saved,
            "is_on_promo": pr.promo is not None,
            "promo_description": pr.promo["description"] if pr.promo else None,
            "is_club_promo": bool(pr.club_id),
            "club_id": pr.club_id,
            "bundle_description": pr.bundle["description"] if pr.bundle else None,
            "bundle_hint": pr.bundle_hint,
            "is_sponsored": bool(product.get("is_sponsored")),
            "locked": locked,
            "warning_labels": product.get("warning_labels", []),
            "health_score": product.get("health_score"),
            "shelf_life_days": product.get("shelf_life_days", 30),
            "substitute_policy": "brand_alternative",
            "note": note,
            "source": source,
        }


@lru_cache(maxsize=1)
def get_catalog() -> Catalog:
    """FastAPI dependency - the catalog is loaded once per process."""
    return Catalog()
