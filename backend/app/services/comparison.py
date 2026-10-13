"""Cross-store comparison and the multi-store Split Basket optimizer (Pro)."""
from __future__ import annotations

from typing import Dict, List, Sequence

from app.services.catalog import Catalog

MAX_SPLIT_STORES = 2        # splitting across more than two chains stops being worth the drive


def compare_stores(catalog: Catalog, items: Sequence[dict], clubs: Sequence[str] = (),
                   include_delivery: bool = True) -> List[dict]:
    """Price the same cart at every chain. items: [{'gtin','qty'}]"""
    rows = []
    for store in catalog.stores:
        sid = store["id"]
        total, promo_saved, missing = 0.0, 0.0, 0
        for it in items:
            gtin = it["gtin"] if isinstance(it, dict) else it.gtin
            qty = int(it.get("qty", 1) if isinstance(it, dict) else getattr(it, "qty", 1))
            product = catalog.by_gtin.get(gtin)
            if not product or sid not in product["prices"]:
                missing += 1
                continue
            pr = catalog.price(product, sid, clubs, qty)
            total += pr.total
            promo_saved += pr.saved
        total = round(total, 2)
        fee = float(store["delivery_fee"]) if include_delivery else 0.0
        rows.append({
            "store_id": sid,
            "store_name": store["name"],
            "color": store["color"],
            "items_total": total,
            "delivery_fee": fee,
            "grand_total": round(total + fee, 2),
            "missing_items": missing,
            "promo_savings": round(promo_saved, 2),
            "meets_minimum": total >= float(store.get("min_online_order", 0)),
            "diff_from_best": 0.0,
            "is_best": False,
        })

    best = min(rows, key=lambda r: r["grand_total"])
    for r in rows:
        r["diff_from_best"] = round(r["grand_total"] - best["grand_total"], 2)
        r["is_best"] = r["store_id"] == best["store_id"]
    rows.sort(key=lambda r: r["grand_total"])
    return rows


def split_basket(catalog: Catalog, items: Sequence[dict], clubs: Sequence[str] = (),
                 max_stores: int = MAX_SPLIT_STORES) -> dict:
    """Best combination of up to `max_stores` chains for one cart.

    Every pair of chains is evaluated exhaustively (10 combinations for 5
    chains): each line goes to the cheaper chain of the pair, and both delivery
    fees are added. The split is only returned when it beats the single
    cheapest chain - two delivery fees usually eat a thin saving.
    """
    from itertools import combinations

    norm = []
    for it in items:
        gtin = it["gtin"] if isinstance(it, dict) else it.gtin
        qty = int(it.get("qty", 1) if isinstance(it, dict) else getattr(it, "qty", 1))
        if catalog.by_gtin.get(gtin):
            norm.append((gtin, qty))

    single = compare_stores(catalog, [{"gtin": g, "qty": q} for g, q in norm], clubs, include_delivery=True)
    best_single = single[0]["grand_total"] if single else 0.0

    store_ids = [s["id"] for s in catalog.stores]
    best_combo, best_total, best_assign = None, float("inf"), None
    best_pickup = None

    for size in range(2, max_stores + 1):
        for combo in combinations(store_ids, size):
            assign: Dict[str, List[tuple]] = {sid: [] for sid in combo}
            total = 0.0
            for gtin, qty in norm:
                product = catalog.by_gtin[gtin]
                sid = min(combo, key=lambda s: catalog.price(product, s, clubs, qty).total)
                assign[sid].append((gtin, qty))
                total += catalog.price(product, sid, clubs, qty).total
            used = {sid: rows for sid, rows in assign.items() if rows}
            if len(used) < 2:
                continue
            subtotals = {sid: sum(catalog.price(catalog.by_gtin[g], sid, clubs, q).total for g, q in rows)
                         for sid, rows in used.items()}
            fees = sum(float(catalog.store(sid)["delivery_fee"]) for sid in used)
            # variant A: delivery from every chain
            cand_a = total + fees
            # variant B: the smaller basket is collected in person (no delivery fee)
            pickup_sid = min(subtotals, key=lambda s: subtotals[s])
            cand_b = total + fees - float(catalog.store(pickup_sid)["delivery_fee"])
            for cand, pickup in ((cand_a, None), (cand_b, pickup_sid)):
                if cand < best_total:
                    best_combo, best_total, best_assign = combo, round(cand, 2), assign
                    best_pickup = pickup

    split_rows = []
    if best_assign:
        for sid, rows in best_assign.items():
            if not rows:
                continue
            store = catalog.store(sid)
            cart_items = [catalog.to_cart_item(catalog.by_gtin[g], sid, q, clubs, source="split") for g, q in rows]
            is_pickup = sid == best_pickup
            split_rows.append({
                "store_id": sid, "store_name": store["name"], "items": cart_items,
                "items_total": round(sum(i["line_total"] for i in cart_items), 2),
                "delivery_fee": 0.0 if is_pickup else float(store["delivery_fee"]),
                "pickup": is_pickup,
            })
        split_rows.sort(key=lambda r: -r["items_total"])

    saving = round(best_single - best_total, 2)
    return {
        "split": split_rows if saving > 0 else None,
        "split_total": best_total if saving > 0 else None,
        "split_saving": saving,
        "best_single_total": best_single,
        "pickup_store_id": best_pickup if saving > 0 else None,
        "worth_it": saving > 0,
    }


def build_comparison(catalog: Catalog, items: Sequence[dict], clubs: Sequence[str] = (),
                     include_delivery: bool = True, allow_split: bool = False) -> dict:
    rows = compare_stores(catalog, items, clubs, include_delivery)
    best, worst = rows[0], rows[-1]
    result = {
        "stores": rows,
        "best_store_id": best["store_id"],
        "best_total": best["grand_total"],
        "worst_total": worst["grand_total"],
        "max_saving": round(worst["grand_total"] - best["grand_total"], 2),
        "split": None,
        "split_total": None,
        "split_saving": None,
        "split_requires_pro": True,
    }
    if allow_split:
        sp = split_basket(catalog, items, clubs)
        result.update(split=sp["split"], split_total=sp["split_total"], split_saving=sp["split_saving"])
        if not sp["worth_it"]:
            result["split_message_he"] = (
                f"פיצול בין שתי רשתות לא משתלם לסל הזה - דמי המשלוח הכפולים "
                f"מוסיפים {abs(sp['split_saving']):.0f} ₪ יותר מהחיסכון")
        else:
            parts = []
            for r in sp["split"]:
                mode = "באיסוף עצמי" if r.get("pickup") else "במשלוח"
                parts.append(f"{r['store_name']} {mode} ({r['items_total']:.0f} ₪)")
            result["split_message_he"] = " + ".join(parts) + f" - חיסכון נוסף של {sp['split_saving']:.0f} ₪"
            result["split_pickup_store_id"] = sp.get("pickup_store_id")
    return result
