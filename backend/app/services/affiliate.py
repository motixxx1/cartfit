"""Deep links to the chains' own sites, with the affiliate tag attached.

Israeli supermarket sites do not expose a public "add these barcodes to cart"
endpoint, so the app generates pre-filled search links per line, and the Chrome
extension (see /extension) uses the same payload to inject the whole cart.
"""
from __future__ import annotations

from typing import Dict, List, Sequence
from urllib.parse import quote, urlencode

from app.core.config import settings
from app.services.catalog import Catalog


def product_deep_link(catalog: Catalog, gtin: str, store_id: str) -> str:
    product = catalog.by_gtin.get(gtin)
    store = catalog.store(store_id)
    base = store.get("online_url") or ""
    term = product["name"] if product else gtin
    link = f"{base}{quote(term)}"
    sep = "&" if "?" in link else "?"
    return f"{link}{sep}{urlencode({'utm_source': settings.affiliate_tag, 'utm_medium': 'app', 'aff': settings.affiliate_tag})}"


def cart_deep_links(catalog: Catalog, items: Sequence[dict], store_id: str) -> List[Dict[str, str]]:
    return [{
        "gtin": it["gtin"],
        "name": it["name"],
        "qty": it.get("qty", 1),
        "url": product_deep_link(catalog, it["gtin"], store_id),
    } for it in items]


def extension_payload(catalog: Catalog, items: Sequence[dict], store_id: str) -> dict:
    """Handed to the Chrome extension: barcodes + names + quantities."""
    store = catalog.store(store_id)
    return {
        "version": 1,
        "store_id": store_id,
        "store_name": store["name"],
        "site": store.get("online_url"),
        "affiliate": settings.affiliate_tag,
        "lines": [{"gtin": i["gtin"], "name": i["name"], "qty": i.get("qty", 1)} for i in items],
    }


def whatsapp_text(items: Sequence[dict], *, store_name: str, total: float,
                  picker_notes: Sequence[str] = (), budget: float | None = None) -> str:
    """Formatted checklist for WhatsApp export."""
    lines = [f"🛒 *רשימת קניות - {store_name}*", ""]
    by_cat: Dict[str, List[dict]] = {}
    labels = {"fresh": "🥬 טרי", "protein": "🍗 בשר וחלבון", "pantry": "🥫 יבש ומזווה",
              "snacks": "🍫 חטיפים ושתייה", "extra": "🧻 נלווים"}
    for it in items:
        by_cat.setdefault(it["category"], []).append(it)
    for cat, label in labels.items():
        rows = by_cat.get(cat)
        if not rows:
            continue
        lines.append(f"*{label}*")
        for it in rows:
            qty = f" x{it['qty']}" if it.get("qty", 1) > 1 else ""
            promo = " 🏷️" if it.get("is_on_promo") else ""
            lines.append(f"☐ {it['name']}{qty} - ₪{it['line_total']:.2f}{promo}")
        lines.append("")
    lines.append(f"*סה\"כ: ₪{total:.2f}*")
    if budget:
        lines.append(f"תקציב: ₪{budget:.0f} | נותרו: ₪{budget - total:.2f}")
    if picker_notes:
        lines.append("")
        lines.append("*הערות למלקט:*")
        lines.extend(f"• {n}" for n in picker_notes)
    lines.append("")
    lines.append("נבנה עם CartFit 🧮")
    return "\n".join(lines)


def whatsapp_url(text: str) -> str:
    return "https://wa.me/?text=" + quote(text)
