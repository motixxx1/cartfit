"""Budget optimization: a multiple-choice knapsack that fills a cart to the shekel.

The basket is built per category (Fresh 35% / Protein 25% / Pantry 20% /
Snacks 10% / Extra 10%), each category solved as a 0/1 knapsack where every
product may also be taken as a multi-buy bundle ("3 ב-25 ₪") - that makes it a
multiple-choice knapsack. Whatever budget is left over is closed by a greedy
residual filler so the cart lands between 98% and 100% of the target.
"""
from __future__ import annotations

import math
import random
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from app.services.catalog import CATEGORY_LABELS_HE, Catalog

# --------------------------------------------------------------------------- #
#  Category weights
# --------------------------------------------------------------------------- #
CATEGORY_WEIGHTS: Dict[str, Dict[str, float]] = {
    "balanced": {"fresh": 0.35, "protein": 0.25, "pantry": 0.20, "snacks": 0.10, "extra": 0.10},
    "pantry":   {"fresh": 0.20, "protein": 0.15, "pantry": 0.40, "snacks": 0.10, "extra": 0.15},
    "weekend":  {"fresh": 0.30, "protein": 0.35, "pantry": 0.10, "snacks": 0.18, "extra": 0.07},
}

FILLER_MAX_PRICE = 16.0     # impulse / essential items used to close the last shekels
MIN_REMAINING_TO_FILL = 1.5


def _resolution(budget: float) -> int:
    """Knapsack granularity in agorot - coarser for big budgets to stay fast."""
    if budget <= 400:
        return 10
    if budget <= 900:
        return 25
    return 50


# --------------------------------------------------------------------------- #
#  Utility scoring
# --------------------------------------------------------------------------- #
def _utility(product: dict, price_res, ctx: dict) -> float:
    """How much we want this product in the cart (higher = better)."""
    u = float(product.get("staple_score", 5)) * 10.0

    # promos are prioritised, proportionally to the discount
    if price_res.promo:
        u += 15.0 + float(price_res.promo.get("discount_pct", 0)) * 1.2
        if price_res.club_id:
            u += 6.0

    # monetization: a paying brand wins a tie between equivalent alternatives
    u += float(product.get("sponsor_boost", 0)) * 4.0

    # holiday / season relevance
    holiday = ctx.get("holiday")
    if holiday:
        tags = set(product["tags"])
        if tags & set(holiday.get("must_tags", [])):
            u += 45.0
        if tags & set(holiday.get("boost_tags", [])):
            u += 18.0
    season = ctx.get("season")
    if season and set(product["tags"]) & set(season.get("boost_tags", [])):
        u += 10.0

    # health module
    hs = product.get("health_score")
    if hs is not None:
        u += (hs - 60) * 0.12
    if ctx.get("healthy_only") and product.get("warning_labels"):
        u -= 200.0

    # deterministic jitter keeps "shuffle" meaningful without losing quality
    rng = ctx["rng"]
    u *= 1.0 + rng.uniform(-0.18, 0.18)
    return u


def _options_for(product: dict, store_id: str, clubs: Sequence[str], catalog: Catalog,
                 ctx: dict, cap: float) -> List[Tuple[int, float, float]]:
    """Return [(qty, price, utility)] choices for one product: single and bundle."""
    out: List[Tuple[int, float, float]] = []
    single = catalog.price(product, store_id, clubs, 1)
    if single.total <= cap:
        out.append((1, single.total, _utility(product, single, ctx)))

    bundle = product.get("bundles", {}).get(store_id)
    if bundle:
        n = int(bundle["n"])
        multi = catalog.price(product, store_id, clubs, n)
        if multi.total <= cap and multi.total < single.unit_price * n:
            # more units for less per unit - worth extra utility, but not n times more
            u = _utility(product, multi, ctx) * (1.0 + 0.22 * math.log(n + 1))
            out.append((n, multi.total, u))
    return out


# --------------------------------------------------------------------------- #
#  Multiple-choice knapsack (DP)
# --------------------------------------------------------------------------- #
def solve_mckp(items: List[dict], budget: float, resolution: int) -> List[dict]:
    """items: [{'key', 'options': [(qty, price, utility)]}] -> chosen entries."""
    if budget <= 0 or not items:
        return []
    cap = int(budget * 100 // resolution)
    if cap <= 0:
        return []

    NEG = -1e18
    dp = [0.0] * (cap + 1)
    choice: List[List[int]] = [[-1] * (cap + 1) for _ in items]

    for i, item in enumerate(items):
        opts = item["options"]
        new_dp = dp[:]                      # option -1 = skip this product
        row = choice[i]
        for oi, (_, price, util) in enumerate(opts):
            w = int(math.ceil(price * 100 / resolution))
            if w <= 0 or w > cap:
                continue
            for c in range(cap, w - 1, -1):
                cand = dp[c - w] + util
                if cand > new_dp[c] + 1e-9:
                    new_dp[c] = cand
                    row[c] = oi
        dp = new_dp

    # reconstruct
    c = max(range(cap + 1), key=lambda x: dp[x])
    picked: List[dict] = []
    for i in range(len(items) - 1, -1, -1):
        oi = choice[i][c]
        if oi is not None and oi >= 0:
            qty, price, util = items[i]["options"][oi]
            picked.append({"product": items[i]["product"], "qty": qty, "price": price, "utility": util})
            c -= int(math.ceil(price * 100 / resolution))
            if c < 0:
                c = 0
    picked.reverse()
    return picked


# --------------------------------------------------------------------------- #
#  Basket generation
# --------------------------------------------------------------------------- #
def generate_basket(catalog: Catalog, *, target_budget: float, store_id: str,
                    category_focus: str = "balanced", clubs: Sequence[str] = (),
                    locked: Sequence[dict] = (), exclude_gtins: Sequence[str] = (),
                    pantry_gtins: Sequence[str] = (), healthy_only: bool = False,
                    include_delivery_in_budget: bool = False, holiday_id: Optional[str] = None,
                    season_id: Optional[str] = None, seed: int = 0) -> dict:
    store = catalog.store(store_id)
    clubs = list(clubs or [])
    rng = random.Random(seed or 0)
    holiday = catalog.holidays.get(holiday_id) if holiday_id else None
    season = catalog.seasons.get(season_id) if season_id else None
    ctx = {"rng": rng, "healthy_only": healthy_only, "holiday": holiday, "season": season}

    weights = dict(CATEGORY_WEIGHTS.get(category_focus, CATEGORY_WEIGHTS["balanced"]))
    if holiday and holiday.get("focus") in CATEGORY_WEIGHTS:
        weights = dict(CATEGORY_WEIGHTS[holiday["focus"]])

    # ---- delivery rules -------------------------------------------------- #
    delivery_fee = float(store["delivery_fee"])
    min_order = float(store.get("min_online_order", 0))
    spendable = float(target_budget)
    if include_delivery_in_budget:
        spendable = max(0.0, spendable - delivery_fee)

    # ---- locked items are kept across regenerations ----------------------- #
    items: List[dict] = []
    used_gtins = set()
    for lock in locked or []:
        product = catalog.by_gtin.get(lock["gtin"] if isinstance(lock, dict) else lock.gtin)
        if not product or product["gtin"] in used_gtins:
            continue
        qty = int(lock.get("qty", 1) if isinstance(lock, dict) else getattr(lock, "qty", 1))
        item = catalog.to_cart_item(product, store_id, qty, clubs, locked=True, source="locked")
        if item["line_total"] <= spendable:
            items.append(item)
            used_gtins.add(product["gtin"])
            spendable -= item["line_total"]

    blocked = set(exclude_gtins or []) | set(pantry_gtins or []) | used_gtins

    # ---- candidate pool ---------------------------------------------------- #
    def eligible(p: dict) -> bool:
        if p["gtin"] in blocked or store_id not in p["prices"]:
            return False
        if healthy_only and p.get("warning_labels"):
            return False
        if holiday and holiday.get("kosher_pesach_only") and not p.get("kosher_pesach", True):
            return False
        return True

    pool = [p for p in catalog.products if eligible(p)]
    resolution = _resolution(target_budget)

    # ---- per-category knapsack -------------------------------------------- #
    for category, weight in weights.items():
        cat_budget = spendable * weight
        if cat_budget < 2:
            continue
        candidates = [p for p in pool if p["category"] == category]
        entries = []
        for p in candidates:
            opts = _options_for(p, store_id, clubs, catalog, ctx, cat_budget)
            if opts:
                entries.append({"product": p, "options": opts})
        if not entries:
            continue
        for pick in solve_mckp(entries, cat_budget, resolution):
            product = pick["product"]
            item = catalog.to_cart_item(product, store_id, pick["qty"], clubs, source="knapsack")
            items.append(item)
            used_gtins.add(product["gtin"])

    items_total = round(sum(i["line_total"] for i in items), 2)
    budget_ceiling = spendable + sum(i["line_total"] for i in items if i["locked"])
    full_ceiling = float(target_budget) - (delivery_fee if include_delivery_in_budget else 0.0)

    # ---- greedy residual filler ------------------------------------------- #
    fillers_used: List[dict] = []
    remaining = round(full_ceiling - items_total, 2)
    guard = 0
    while remaining >= MIN_REMAINING_TO_FILL and guard < 12:
        guard += 1
        best = None
        for p in pool:
            if p["gtin"] in used_gtins:
                continue
            pr = catalog.price(p, store_id, clubs, 1)
            if pr.total > remaining or pr.total > FILLER_MAX_PRICE:
                continue
            score = (pr.total / remaining) * 100 + ("filler" in p["tags"]) * 20 + p["staple_score"] * 2
            score += 15 if pr.promo else 0
            if best is None or score > best[0]:
                best = (score, p, pr)
        if best is None:
            break
        _, product, _pr = best
        item = catalog.to_cart_item(product, store_id, 1, clubs, source="filler")
        items.append(item)
        fillers_used.append(item)
        used_gtins.add(product["gtin"])
        items_total = round(items_total + item["line_total"], 2)
        remaining = round(full_ceiling - items_total, 2)

    # ---- top-up pass: repeat staples when the catalogue runs out of novelty -- #
    guard = 0
    by_gtin_item = {i["gtin"]: i for i in items}
    while remaining >= MIN_REMAINING_TO_FILL and guard < 60:
        guard += 1
        best = None
        for item in items:
            product = catalog.by_gtin[item["gtin"]]
            if product.get("staple_score", 0) < 5 or item["qty"] >= 6:
                continue
            nxt = catalog.price(product, store_id, clubs, item["qty"] + 1)
            delta = round(nxt.total - item["line_total"], 2)
            if delta <= 0 or delta > remaining:
                continue
            score = (delta / remaining) * 100 + product["staple_score"] * 3 - item["qty"] * 6
            if best is None or score > best[0]:
                best = (score, item, product, nxt, delta)
        if best is None:
            break
        _, item, product, nxt, delta = best
        item["qty"] += 1
        item["line_total"] = nxt.total
        item["saved"] = nxt.saved
        item["bundle_description"] = nxt.bundle["description"] if nxt.bundle else item["bundle_description"]
        item["bundle_hint"] = nxt.bundle_hint
        items_total = round(items_total + delta, 2)
        remaining = round(full_ceiling - items_total, 2)

    # ---- suggestions for whatever is still left --------------------------- #
    suggestions: List[dict] = []
    if remaining >= 1:
        for p in sorted(pool, key=lambda x: -x["staple_score"]):
            if p["gtin"] in used_gtins:
                continue
            pr = catalog.price(p, store_id, clubs, 1)
            if pr.total <= remaining:
                suggestions.append(catalog.to_cart_item(p, store_id, 1, clubs, source="suggestion"))
            if len(suggestions) >= 3:
                break

    return build_basket_payload(
        catalog, items, store=store, target_budget=float(target_budget),
        include_delivery_in_budget=include_delivery_in_budget, suggestions=suggestions,
        seed=seed, clubs=clubs,
    )


# --------------------------------------------------------------------------- #
#  Payload assembly (shared with the cart endpoints)
# --------------------------------------------------------------------------- #
def build_basket_payload(catalog: Catalog, items: List[dict], *, store: dict, target_budget: float,
                         include_delivery_in_budget: bool = False, suggestions: Optional[List[dict]] = None,
                         seed: int = 0, clubs: Sequence[str] = ()) -> dict:
    items_total = round(sum(i["line_total"] for i in items), 2)
    delivery_fee = float(store["delivery_fee"])
    min_order = float(store.get("min_online_order", 0))
    meets_min = items_total >= min_order

    grand_total = round(items_total + (delivery_fee if include_delivery_in_budget else 0.0), 2)
    remaining = round(target_budget - grand_total, 2)
    utilization = round(grand_total / target_budget * 100, 1) if target_budget else 0.0

    # category breakdown (drives the donut chart)
    breakdown = []
    for cat, label in CATEGORY_LABELS_HE.items():
        cat_items = [i for i in items if i["category"] == cat]
        total = round(sum(i["line_total"] for i in cat_items), 2)
        if total:
            breakdown.append({
                "category": cat, "label_he": label, "total": total,
                "pct": round(total / items_total * 100, 1) if items_total else 0.0,
                "items": len(cat_items),
            })
    breakdown.sort(key=lambda b: -b["total"])

    # nutrition roll-up
    nutri = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "sugar_g": 0.0, "sodium_mg": 0.0}
    for i in items:
        p = catalog.by_gtin.get(i["gtin"])
        if not p or not p.get("nutrition"):
            continue
        factor = (float(p["pack_size"]) / 100.0) * i["qty"] if p["pack_unit"] in ("g", "ml") else i["qty"]
        for k in nutri:
            nutri[k] += float(p["nutrition"].get(k, 0)) * factor
    nutri = {k: round(v) for k, v in nutri.items()}

    message = None
    if not meets_min:
        message = (f"מינימום להזמנת אונליין ב{store['name']} הוא {min_order:.0f} ₪ - "
                   f"עברו לאיסוף עצמי או הוסיפו עוד {min_order - items_total:.0f} ₪ לסל")
    elif remaining >= 2:
        names = " או ".join(s["name"].split(" ")[0] for s in (suggestions or [])[:2]) or "פריט קטן"
        message = f"נשארו לך {remaining:.0f} ₪ - אפשר להוסיף {names} לסגירת התקציב"
    elif remaining < 0:
        message = f"חריגה של {abs(remaining):.0f} ₪ מהתקציב - נעל פריטים חיוניים ולחץ על ערבוב מחדש"

    return {
        "store_id": store["id"],
        "store_name": store["name"],
        "target_budget": round(target_budget, 2),
        "items_total": items_total,
        "delivery": {
            "delivery_fee": delivery_fee,
            "min_online_order": min_order,
            "meets_minimum": meets_min,
            "included_in_budget": include_delivery_in_budget,
            "message_he": None if meets_min else message,
        },
        "grand_total": grand_total,
        "remaining": remaining,
        "utilization_pct": utilization,
        "total_saved": round(sum(i["saved"] for i in items), 2),
        "items": items,
        "breakdown": breakdown,
        "nutrition_summary": nutri,
        "warnings_count": sum(1 for i in items if i["warning_labels"]),
        "filler_suggestions": suggestions or [],
        "message_he": message,
        "seed": seed,
    }


# --------------------------------------------------------------------------- #
#  Swap: find an equivalent item at a similar price
# --------------------------------------------------------------------------- #
def find_swap(catalog: Catalog, gtin: str, store_id: str, clubs: Sequence[str] = (),
              direction: str = "equivalent", exclude: Iterable[str] = ()) -> Optional[dict]:
    current = catalog.by_gtin.get(gtin)
    if not current:
        return None
    cur_price = catalog.price(current, store_id, clubs, 1).total
    exclude = set(exclude or []) | {gtin}
    tags = set(current["tags"])

    best, best_score = None, -1e9
    for p in catalog.products:
        if p["gtin"] in exclude or p["category"] != current["category"] or store_id not in p["prices"]:
            continue
        overlap = len(tags & set(p["tags"]))
        if not overlap:
            continue
        pr = catalog.price(p, store_id, clubs, 1)
        delta = pr.total - cur_price
        if direction == "cheaper" and delta >= 0:
            continue
        if direction == "healthier" and (p.get("health_score") or 0) <= (current.get("health_score") or 0):
            continue
        if direction == "equivalent" and abs(delta) > max(4.0, cur_price * 0.25):
            continue
        score = overlap * 10 - abs(delta) * 1.5 + (12 if pr.promo else 0) + p["staple_score"]
        if direction == "cheaper":
            score += -delta * 3
        if direction == "healthier":
            score += ((p.get("health_score") or 0) - (current.get("health_score") or 0)) * 0.5
        if score > best_score:
            best, best_score = p, score
    if not best:
        return None
    return catalog.to_cart_item(best, store_id, 1, clubs, source="swap")
