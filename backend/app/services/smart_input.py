"""Smart input: Hebrew voice/free-text intent, receipt OCR text, recipe import."""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Sequence

from app.services.catalog import Catalog

# --------------------------------------------------------------------------- #
#  Hebrew intent parsing  ("תרכיב לי סל לשישי ב-400 שקל כולל עוף, חלות ושתייה")
# --------------------------------------------------------------------------- #
HE_NUMBERS = {
    "אחד": 1, "אחת": 1, "שניים": 2, "שתיים": 2, "שני": 2, "שתי": 2, "שלושה": 3, "שלוש": 3,
    "ארבעה": 4, "ארבע": 4, "חמישה": 5, "חמש": 5, "שישה": 6, "שש": 6, "שבעה": 7, "שבע": 7,
    "שמונה": 8, "תשעה": 9, "תשע": 9, "עשרה": 10, "עשר": 10, "שתים עשרה": 12,
}
DISH_WORDS = {
    "shawarma": ["שווארמה", "שוארמה", "פרגית"],
    "burger": ["המבורגר", "בורגר", "קציצות"],
    "pizza": ["פיצה", "פיצות"],
    "bbq": ["על האש", "מנגל", "ברביקיו", "על-האש"],
}
STORE_WORDS = {
    "shufersal": ["שופרסל", "שופר סל"],
    "rami_levy": ["רמי לוי", "רמי-לוי", "רמי"],
    "carrefour": ["קרפור", "קארפור"],
    "victory": ["ויקטורי"],
    "yohananof": ["יוחננוף", "יוחנונוף"],
}
HOLIDAY_WORDS = {
    "shabbat": ["שישי", "שבת", "ארוחת שישי", "שישבת"],
    "rosh_hashana": ["ראש השנה", "ראש-השנה"],
    "pesach": ["פסח", "כשר לפסח", "ליל הסדר"],
    "bbq_day": ["יום העצמאות", "לג בעומר", 'ל"ג בעומר', "מנגל"],
    "shavuot": ["שבועות"],
}
ITEM_WORDS = {
    "chicken": ["עוף", "פרגית", "שניצל"], "bread": ["חלות", "חלה", "לחם"],
    "drink": ["שתייה", "שתיה", "קולה", "משקאות"], "veg": ["ירקות", "סלט"],
    "fruit": ["פירות"], "dairy": ["חלב", "גבינות", "מוצרי חלב"],
    "chips_frozen": ["צ'יפס", "צ׳יפס", "ציפס"], "snack": ["חטיפים", "נשנושים"],
    "ground_beef": ["בשר טחון", "בקר"], "fish": ["דגים", "סלמון"],
    "rice": ["אורז"], "pasta": ["פסטה"], "coffee": ["קפה"], "household": ["ניקיון", "נייר טואלט"],
}
FOCUS_WORDS = {"pantry": ["מזווה", "יבשים", "אחסון"], "weekend": ["שישי", "שבת", "אירוח", "מנגל", "חג"]}


def parse_intent(text: str) -> dict:
    """Free Hebrew speech/text -> algorithm inputs. Used by the mic button."""
    t = (text or "").strip()
    low = t.replace("־", "-")
    intent: Dict[str, object] = {
        "raw": t, "mode": "budget", "budget": None, "store_id": None, "recipe_id": None,
        "adults": None, "kids": None, "holiday_id": None, "must_tags": [], "healthy_only": False,
        "confidence": 0.0,
    }
    hits = 0

    # budget: "ב-400 שקל", "400 ש\"ח", "תקציב 350"
    m = re.search(r"(?:ב-?|תקציב\s*(?:של)?\s*|עד\s*)(\d{2,5})\s*(?:₪|ש\"?ח|שקל|שקלים)?", low)
    if not m:
        m = re.search(r"(\d{2,5})\s*(?:₪|ש\"?ח|שקל|שקלים)", low)
    if m:
        intent["budget"] = float(m.group(1)); hits += 1

    # diners: "ל-5 אנשים", "לארבעה סועדים", "עם 2 ילדים"
    m = re.search(r"ל-?\s*(\d{1,2})\s*(?:אנשים|סועדים|נפשות|חבר'?ה|איש)?", low)
    if m:
        intent["adults"] = int(m.group(1)); hits += 1
    else:
        for word, val in HE_NUMBERS.items():
            if re.search(rf"ל{word}\b|ל-{word}\b", low):
                intent["adults"] = val; hits += 1
                break
    m = re.search(r"(\d{1,2})\s*ילדים", low)
    if m:
        intent["kids"] = int(m.group(1)); hits += 1

    for rid, words in DISH_WORDS.items():
        if any(w in low for w in words):
            intent["recipe_id"] = rid; intent["mode"] = "meal"; hits += 1
            break
    for sid, words in STORE_WORDS.items():
        if any(w in low for w in words):
            intent["store_id"] = sid; hits += 1
            break
    for hid, words in HOLIDAY_WORDS.items():
        if any(w in low for w in words):
            intent["holiday_id"] = hid; hits += 1
            break
    tags = [tag for tag, words in ITEM_WORDS.items() if any(w in low for w in words)]
    intent["must_tags"] = tags
    hits += bool(tags)
    if any(w in low for w in ["בריא", "דל", "בלי סוכר", "דיאטה"]):
        intent["healthy_only"] = True; hits += 1
    if intent["recipe_id"] and intent["adults"]:
        intent["mode"] = "meal"
    intent["confidence"] = round(min(1.0, hits / 4.0), 2)
    return intent


# --------------------------------------------------------------------------- #
#  Receipt OCR text -> cart
# --------------------------------------------------------------------------- #
RECEIPT_LINE = re.compile(
    r"^(?P<name>[^\d]{2,40}?)\s*(?:x\s*(?P<qty>\d{1,2}))?\s*(?P<price>\d{1,4}[.,]\d{2})\s*$")
BARCODE_LINE = re.compile(r"\b(\d{8,13})\b")


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def match_product(catalog: Catalog, text: str, price_hint: Optional[float] = None) -> Optional[dict]:
    """Fuzzy-match a receipt line to a catalogue SKU (name tokens + price)."""
    text = re.sub(r"[^֐-׿\w\s%]", " ", text or "").strip()
    if not text:
        return None
    tokens = [t for t in text.split() if len(t) > 1]
    best, best_score = None, 0.0
    for p in catalog.products:
        name = p["name"]
        overlap = sum(1 for t in tokens if t in name or t in p["brand"])
        score = overlap * 0.35 + _similarity(text, name) * 0.65
        if price_hint:
            closest = min(abs(price_hint - v) for v in p["prices"].values())
            score += max(0.0, 0.25 - closest / 40.0)
        if score > best_score:
            best, best_score = p, score
    return best if best_score >= 0.45 else None


def parse_receipt(catalog: Catalog, text: str, store_id: Optional[str] = None) -> dict:
    """Receipt photo (already OCR'd to text) -> a repeatable cart."""
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    matched, unmatched = [], []
    detected_store = store_id
    for sid, words in STORE_WORDS.items():
        if any(w in text for w in words):
            detected_store = detected_store or sid
    detected_store = detected_store or "shufersal"

    skip_words = ("סה\"כ", "סהכ", "סה״כ", "מזומן", "אשראי", "עודף", "כרטיס", "מע\"מ", "מעמ",
                  "לתשלום", "חשבונית", "קופה", "תודה", "ברוכים", "מספר עסקה", "נקודות")
    for line in lines:
        if any(w in line for w in skip_words):
            unmatched.append(line)
            continue
        bc = BARCODE_LINE.search(line)
        product = None
        qty, price = 1, None
        if bc and bc.group(1) in catalog.by_gtin:
            product = catalog.by_gtin[bc.group(1)]
        else:
            m = RECEIPT_LINE.match(line)
            if m:
                qty = int(m.group("qty") or 1)
                price = float(m.group("price").replace(",", "."))
                product = match_product(catalog, m.group("name"), price)
            else:
                product = match_product(catalog, line)
        if product:
            existing = next((i for i in matched if i["gtin"] == product["gtin"]), None)
            if existing:
                existing["qty"] += qty
                pr = catalog.price(product, detected_store, (), existing["qty"])
                existing["line_total"], existing["saved"] = pr.total, pr.saved
                continue
            item = catalog.to_cart_item(product, detected_store, qty, source="receipt")
            item["note"] = f"מהקבלה: {line[:40]}"
            if price:
                item["receipt_price"] = price
            matched.append(item)
        elif len(line) > 3 and not line.replace(" ", "").isdigit():
            unmatched.append(line)

    return {
        "store_id": detected_store,
        "items": matched,
        "unmatched_lines": unmatched[:10],
        "matched_count": len(matched),
        "total": round(sum(i["line_total"] for i in matched), 2),
    }


# --------------------------------------------------------------------------- #
#  Recipe text / URL -> cart
# --------------------------------------------------------------------------- #
QTY_LINE = re.compile(
    r"^\s*[-*•]?\s*(?P<qty>\d+(?:[.,]\d+)?)?\s*"
    r"(?P<unit>ק\"?ג|קילוגרם|קילו|גרמים|גרם|ג'|מ\"?ל|ליטרים|ליטר|כוסות|כוס|כפיות|כפית|כפות|כף|"
    r"יחידות|יחידה|חבילות|חבילה|שקית|צרור)?\s*(?P<name>.+?)\s*$")
UNIT_TO_G = {"ק\"ג": 1000, "קילוגרם": 1000, "קילו": 1000, "גרם": 1, "גרמים": 1, "ג'": 1,
             "מ\"ל": 1, "ליטר": 1000, "ליטרים": 1000, "כוס": 240, "כוסות": 240,
             "כף": 15, "כפות": 15, "כפית": 5, "כפיות": 5}
COUNT_UNITS = ("יחידה", "יחידות", "חבילה", "חבילות", "שקית", "צרור")
NOISE = ("אופן ההכנה", "הוראות", "מצרכים", "רכיבים", "לסועד", "דקות", "תנור", "בתיאבון")


def import_recipe(catalog: Catalog, *, text: Optional[str] = None, url: Optional[str] = None,
                  store_id: str = "shufersal", servings: int = 4) -> dict:
    """Pasted recipe text (or a fetched page) -> shelf products in the cart."""
    body = text or ""
    source = "text"
    if url and not body:
        source = "url"
        try:                                    # pragma: no cover - needs network
            import httpx

            html = httpx.get(url, timeout=10.0, follow_redirects=True).text
            body = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
            body = re.sub(r"<[^>]+>", "\n", body)
        except Exception as exc:
            return {"ok": False, "error": f"לא ניתן למשוך את הדף: {exc}", "items": [], "source": source}

    seen, items, unmatched = set(), [], []
    for raw in body.splitlines():
        line = raw.strip(" \t-•*")
        if not line or len(line) < 3 or any(n in line for n in NOISE):
            continue
        m = QTY_LINE.match(line)
        if not m:
            continue
        name = m.group("name").strip()
        if len(name) < 2 or len(name.split()) > 7:
            continue
        product = match_product(catalog, name)
        if not product or product["gtin"] in seen:
            if not product and len(name) > 2:
                unmatched.append(line[:40])
            continue
        qty_raw = float((m.group("qty") or "1").replace(",", "."))
        unit = m.group("unit") or ""
        needed = qty_raw * UNIT_TO_G.get(unit, 1) if unit in UNIT_TO_G else qty_raw
        if unit in UNIT_TO_G and product["pack_unit"] in ("g", "ml"):
            packs = max(1, int(-(-needed * (servings / 4) // float(product["pack_size"]))))
        elif unit in COUNT_UNITS and product["pack_unit"] in ("g", "ml") and float(product["pack_size"]) >= 400:
            packs = 1          # "2 יחידות בצל" is not 2kg of onions
        else:
            packs = max(1, int(round(qty_raw * servings / 4)) if qty_raw < 10 else 1)
        seen.add(product["gtin"])
        item = catalog.to_cart_item(product, store_id, packs, source="recipe_import")
        item["note"] = f"מהמתכון: {line[:40]}"
        items.append(item)

    return {
        "ok": True,
        "source": source,
        "store_id": store_id,
        "servings": servings,
        "items": items,
        "unmatched_lines": unmatched[:8],
        "total": round(sum(i["line_total"] for i in items), 2),
    }
