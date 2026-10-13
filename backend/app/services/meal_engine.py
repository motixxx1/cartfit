"""Meal-to-Cart engine: diners -> grams -> real retail SKUs -> cart + cooking guide."""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence

from app.services.catalog import Catalog

KID_FACTOR = 0.6


def servings_for(adults: int, kids: int) -> float:
    """scale = adults_count + (kids_count * 0.6)"""
    return round(adults + kids * KID_FACTOR, 2)


def _pack_count(total_needed: float, pack_size: float) -> int:
    """1.2kg of meat -> how many retail packs. Never rounds down below the need."""
    if pack_size <= 0:
        return 1
    packs = total_needed / pack_size
    # a 7% overshoot tolerance: 1.07 packs still buys one pack
    return max(1, int(math.ceil(round(packs - 0.07, 3))))


def _pick_product(catalog: Catalog, tag: str, store_id: str, clubs: Sequence[str],
                  prefer: str = "value") -> Optional[dict]:
    """Best SKU carrying a tag: cheapest per 100g/unit, promos included."""
    best, best_score = None, float("inf")
    for p in catalog.by_tag(tag):
        if store_id not in p["prices"]:
            continue
        pr = catalog.price(p, store_id, clubs, 1)
        size = float(p["pack_size"]) or 1.0
        per_unit = pr.unit_price / size
        score = per_unit * (0.9 if pr.promo else 1.0)
        if prefer == "cheapest":
            score = pr.unit_price
        if score < best_score:
            best, best_score = p, score
    return best


def calculate_meal(catalog: Catalog, *, recipe_id: str, store_id: str, adults_count: int = 4,
                   kids_count: int = 0, sides: Sequence[str] = (), pantry_keys: Sequence[str] = (),
                   clubs: Sequence[str] = (), budget_cap: Optional[float] = None) -> dict:
    recipe = catalog.recipes.get(recipe_id)
    if not recipe:
        raise KeyError(f"unknown recipe '{recipe_id}'")
    store = catalog.store(store_id)
    servings = servings_for(adults_count, kids_count)
    pantry = set(pantry_keys or [])
    chosen_sides = list(sides) if sides else list(recipe.get("default_sides", []))

    # ---- 1. requirements: hero ingredients + selected sides ---------------- #
    reqs: List[dict] = []
    for ing in recipe["ingredients"]:
        reqs.append({"key": ing["key"], "tag": ing["tag"], "label": ing["label"],
                     "per_person": float(ing["per_person"]), "unit": ing["unit"],
                     "role": ing.get("role", "base"), "pantry_optional": bool(ing.get("pantry_optional")),
                     "source": "recipe"})
    for side_id in chosen_sides:
        side = catalog.sides.get(side_id)
        if not side:
            continue
        reqs.append({"key": side_id, "tag": side["tag"], "label": side["label"],
                     "per_person": float(side["per_person"]), "unit": side["unit"],
                     "role": "side", "pantry_optional": False, "source": "side"})
        for extra in side.get("extra", []):
            reqs.append({"key": f"{side_id}_{extra['tag']}", "tag": extra["tag"], "label": extra["label"],
                         "per_person": float(extra["per_person"]), "unit": extra["unit"],
                         "role": "side", "pantry_optional": False, "source": "side"})

    # merge duplicates of the same tag (e.g. pita in both recipe and sides)
    merged: Dict[str, dict] = {}
    for r in reqs:
        if r["tag"] in merged:
            merged[r["tag"]]["per_person"] = max(merged[r["tag"]]["per_person"], r["per_person"])
        else:
            merged[r["tag"]] = r
    reqs = list(merged.values())

    # ---- 2. grams -> packs -> cart items ----------------------------------- #
    items: List[dict] = []
    quantities: List[dict] = []
    excluded: List[str] = []
    prefer = "cheapest" if budget_cap else "value"

    for r in reqs:
        if r["pantry_optional"] and r["key"] in pantry:
            excluded.append(r["label"])
            continue
        product = _pick_product(catalog, r["tag"], store_id, clubs, prefer=prefer)
        if not product:
            continue
        total_needed = round(r["per_person"] * servings, 1)
        packs = _pack_count(total_needed, float(product["pack_size"]))
        item = catalog.to_cart_item(product, store_id, packs, clubs, source="meal",
                                    note=f"{r['label']}: {total_needed:g} {r['unit']} לכל הסועדים")
        items.append(item)
        quantities.append({
            "key": r["key"], "label": r["label"], "role": r["role"],
            "needed": total_needed, "unit": r["unit"],
            "product": product["name"], "gtin": product["gtin"],
            "pack_size": product["pack_size"], "pack_unit": product["pack_unit"],
            "packs": packs, "line_total": item["line_total"],
            "pantry_optional": r["pantry_optional"],
        })

    total = round(sum(i["line_total"] for i in items), 2)

    # ---- 3. budget cap: downgrade to the cheapest SKU per tag -------------- #
    over_budget = bool(budget_cap and total > budget_cap)

    # ---- 4. nutrition per serving ------------------------------------------ #
    nutri = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "sugar_g": 0.0, "sodium_mg": 0.0}
    for q in quantities:
        p = catalog.by_gtin[q["gtin"]]
        if not p.get("nutrition"):
            continue
        # count what is actually eaten (the requirement), not the whole pack
        factor = q["needed"] / 100.0 if q["unit"] in ("g", "ml") else q["needed"]
        for k in nutri:
            nutri[k] += float(p["nutrition"].get(k, 0)) * factor
    per_serving_nutri = {k: round(v / servings) if servings else 0 for k, v in nutri.items()}

    # ---- 5. delivery benchmark (the Wolt comparison) ----------------------- #
    bench = float(recipe.get("delivery_benchmark_per_person", 70))
    delivery_total = round(bench * (adults_count + kids_count * 0.75), 2)
    saving = round(max(0.0, delivery_total - total), 2)
    saving_pct = int(round(saving / delivery_total * 100)) if delivery_total else 0
    per_serving = round(total / servings, 2) if servings else 0.0

    badge = (f'סה"כ: ₪{total:.0f} (רק ₪{per_serving:.1f} לסועד! '
             f'חיסכון של {saving_pct}% מהזמנת משלוח)')

    steps = recipe["steps"]
    return {
        "recipe_id": recipe_id,
        "title": recipe["title"],
        "emoji": recipe.get("emoji", "🍽️"),
        "servings": servings,
        "adults_count": adults_count,
        "kids_count": kids_count,
        "store_id": store_id,
        "store_name": store["name"],
        "items": items,
        "excluded_pantry": excluded,
        "total": total,
        "per_serving": per_serving,
        "delivery_benchmark_per_person": bench,
        "delivery_total": delivery_total,
        "saving_vs_delivery": saving,
        "saving_pct": saving_pct,
        "badge_he": badge,
        "steps": steps,
        "total_time_min": sum(int(s["duration_min"]) for s in steps),
        "nutrition_per_serving": per_serving_nutri,
        "quantities": quantities,
        "over_budget": over_budget,
    }
