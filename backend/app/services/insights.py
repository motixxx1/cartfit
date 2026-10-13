"""Savings tracker, personal inflation, price-drop watchlist, pantry & leftovers."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Sequence

from app.core import db
from app.services.catalog import CATEGORY_LABELS_HE, Catalog

PRO_WATCHLIST_LIMIT_FREE = 3        # CartFit Pro removes the cap
DROP_ALERT_PCT = 8                  # a drop worth a push notification


# --------------------------------------------------------------------------- #
#  Savings tracker
# --------------------------------------------------------------------------- #
def record_basket(user_id: str, basket: dict, comparison: Optional[dict] = None) -> None:
    """Called when a cart is checked out: logs what the alternative would have cost."""
    worst = comparison["worst_total"] if comparison else basket["items_total"]
    db.log_savings(user_id, basket["store_id"], basket["items_total"], worst,
                   basket.get("total_saved", 0.0),
                   {"items": [{"gtin": i["gtin"], "qty": i["qty"], "category": i["category"],
                               "line_total": i["line_total"]} for i in basket["items"]]})


def savings_summary(user_id: str, month: Optional[str] = None) -> dict:
    rows = db.savings_rows(user_id)
    month = month or datetime.utcnow().strftime("%Y-%m")
    in_month = [r for r in rows if r["created_at"].startswith(month)]

    promo_saved = round(sum(r["promo_saved"] for r in in_month), 2)
    switch_saved = round(sum(max(0.0, r["worst_total"] - r["items_total"]) for r in in_month), 2)
    total = round(promo_saved + switch_saved, 2)

    headline = (f"החודש חסכת ₪{total:.0f} בזכות בחירת הרשת הזולה ומיצוי מבצעים"
                if total else "עוד לא נרשם חיסכון החודש - בנה סל כדי להתחיל לעקוב")

    return {
        "month": month,
        "total_saved": total,
        "promo_saved": promo_saved,
        "store_switch_saved": switch_saved,
        "baskets": len(in_month),
        "entries": [{"date": r["created_at"][:10], "store_id": r["store_id"],
                     "items_total": round(r["items_total"], 2), "worst_total": round(r["worst_total"], 2),
                     "promo_saved": round(r["promo_saved"], 2),
                     "saved": round(r["promo_saved"] + max(0.0, r["worst_total"] - r["items_total"]), 2)}
                    for r in in_month],
        "headline_he": headline,
        "personal_inflation_pct": personal_inflation(user_id),
    }


def personal_inflation(user_id: str, months: int = 6) -> Optional[float]:
    """How the user's own recurring basket moved, first month vs last."""
    rows = sorted(db.savings_rows(user_id, limit=500), key=lambda r: r["created_at"])
    if len(rows) < 2:
        return None
    by_month: Dict[str, List[float]] = defaultdict(list)
    for r in rows:
        by_month[r["created_at"][:7]].append(r["items_total"])
    keys = sorted(by_month)[-months:]
    if len(keys) < 2:
        return None
    first = sum(by_month[keys[0]]) / len(by_month[keys[0]])
    last = sum(by_month[keys[-1]]) / len(by_month[keys[-1]])
    if not first:
        return None
    return round((last - first) / first * 100, 1)


def monthly_category_split(user_id: str, month: Optional[str] = None) -> List[dict]:
    """Where the money went this month - feeds the donut on the insights screen."""
    month = month or datetime.utcnow().strftime("%Y-%m")
    totals: Dict[str, float] = defaultdict(float)
    for row in db.savings_rows(user_id, limit=500):
        if not row["created_at"].startswith(month) or not row["basket_json"]:
            continue
        import json

        for item in json.loads(row["basket_json"]).get("items", []):
            totals[item["category"]] += float(item["line_total"])
    grand = sum(totals.values())
    return [{"category": c, "label_he": CATEGORY_LABELS_HE.get(c, c), "total": round(v, 2),
             "pct": round(v / grand * 100, 1) if grand else 0.0}
            for c, v in sorted(totals.items(), key=lambda kv: -kv[1])]


# --------------------------------------------------------------------------- #
#  Price-drop watchlist
# --------------------------------------------------------------------------- #
def watchlist_status(catalog: Catalog, user_id: str, clubs: Sequence[str] = (),
                     is_pro: bool = False) -> dict:
    rows = db.watch_list(user_id)
    items, alerts = [], []
    for row in rows:
        product = catalog.by_gtin.get(row["gtin"])
        if not product:
            continue
        store_id, price = catalog.best_store_for(product, clubs)
        ref = float(row["reference_price"]) or price
        drop = int(round((ref - price) / ref * 100)) if ref else 0
        pr = catalog.price(product, store_id, clubs, 1)
        entry = {
            "gtin": product["gtin"], "name": product["name"], "best_store_id": store_id,
            "best_store_name": catalog.store(store_id)["name"], "best_price": price,
            "reference_price": round(ref, 2), "drop_pct": drop,
            "is_on_promo": pr.promo is not None,
            "description": pr.promo["description"] if pr.promo else None,
        }
        items.append(entry)
        if drop >= DROP_ALERT_PCT or pr.promo:
            alerts.append({**entry, "push_title": f"ירידת מחיר: {product['name']}",
                           "push_body": f"עכשיו ב-{price:.2f} ₪ ב{entry['best_store_name']}"
                                        + (f" ({drop}% פחות)" if drop > 0 else "")})
    return {
        "items": items,
        "alerts": alerts,
        "limit": None if is_pro else PRO_WATCHLIST_LIMIT_FREE,
        "limit_reached": (not is_pro) and len(items) >= PRO_WATCHLIST_LIMIT_FREE,
    }


# --------------------------------------------------------------------------- #
#  Pantry + expiry + leftovers
# --------------------------------------------------------------------------- #
def stock_cart(catalog: Catalog, user_id: str, items: Sequence[dict]) -> int:
    """After checkout the cart becomes the virtual pantry, with expiry dates."""
    added = 0
    for it in items:
        product = catalog.by_gtin.get(it["gtin"])
        if not product:
            continue
        expires = (date.today() + timedelta(days=int(product.get("shelf_life_days", 30)))).isoformat()
        db.pantry_upsert(user_id, product["gtin"], int(it.get("qty", 1)), expires)
        added += 1
    return added


def pantry_status(catalog: Catalog, user_id: str) -> dict:
    today = date.today()
    rows, expiring = [], []
    for r in db.pantry_list(user_id):
        product = catalog.by_gtin.get(r["gtin"])
        if not product:
            continue
        exp = r["expires_at"]
        days_left = (date.fromisoformat(exp) - today).days if exp else None
        entry = {"gtin": r["gtin"], "name": product["name"], "category": product["category"],
                 "qty": r["qty"], "expires_at": exp, "days_left": days_left,
                 "tags": product["tags"]}
        rows.append(entry)
        if days_left is not None and days_left <= 3:
            expiring.append(entry)
    rows.sort(key=lambda x: (x["days_left"] is None, x["days_left"]))
    return {"items": rows, "expiring_soon": expiring,
            "message_he": (f"{len(expiring)} פריטים מתקרבים לתפוגה - הנה מה אפשר להכין מהם"
                           if expiring else None)}


def leftover_ideas(catalog: Catalog, item_gtins: Sequence[str], limit: int = 3) -> List[dict]:
    """'מה מכינים ממה שנשאר?' - matches recipes against what was actually bought."""
    owned_tags = set()
    for g in item_gtins:
        p = catalog.by_gtin.get(g)
        if p:
            owned_tags.update(p["tags"])
    scored = []
    for idea in catalog.leftover_ideas:
        needs = set(idea["needs"])
        have = needs & owned_tags
        if not have:
            continue
        coverage = len(have) / len(needs)
        scored.append({**idea, "coverage_pct": int(coverage * 100),
                       "have_tags": sorted(have), "missing_tags": sorted(needs - owned_tags)})
    scored.sort(key=lambda x: (-x["coverage_pct"], x["time_min"]))
    return scored[:limit]
