"""Israeli Food Transparency Law (חוק המזון) price-file pipeline.

Every chain publishes gzipped XML files to a public portal:

    PriceFull<ChainId>-<StoreId>-<yyyyMMddHHmm>.gz   full price snapshot
    Price<ChainId>-<StoreId>-<yyyyMMddHHmm>.gz       incremental price updates
    PromoFull<ChainId>-<StoreId>-<yyyyMMddHHmm>.gz   full promotion snapshot
    Promo<ChainId>-<StoreId>-<yyyyMMddHHmm>.gz       incremental promotions
    StoresFull<ChainId>-<yyyyMMddHHmm>.gz            branch list

Field names differ slightly between chains (ItemCode/ItemId, ItemPrice/Price,
PromotionId/PromoId, …), so every getter below checks a list of aliases.
Products are matched across chains by their GTIN barcode (ItemCode).
"""
from __future__ import annotations

import gzip
import io
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional

FILE_PATTERN = re.compile(
    r"^(?P<kind>PriceFull|Price|PromoFull|Promo|StoresFull|Stores)"
    r"(?P<chain>\d{10,13})-?(?P<store>\d{1,4})?-?(?P<ts>\d{12,14})?",
    re.IGNORECASE,
)

# public portals, for reference by the ingestion job
CHAIN_PORTALS: Dict[str, Dict[str, str]] = {
    "shufersal": {"chain_id": "7290027600007", "portal": "https://prices.shufersal.co.il/", "auth": "none"},
    "rami_levy": {"chain_id": "7290058140886", "portal": "https://url.publishedprices.co.il/login", "auth": "user:RamiLevi"},
    "carrefour": {"chain_id": "7290055700007", "portal": "https://prices.carrefour.co.il/", "auth": "none"},
    "victory":   {"chain_id": "7290696200003", "portal": "https://laibcatalog.co.il/", "auth": "none"},
    "yohananof": {"chain_id": "7290803800003", "portal": "https://url.publishedprices.co.il/login", "auth": "user:yohananof"},
}

ITEM_TAGS = ("Item", "Product", "Line")
PROMO_TAGS = ("Promotion", "Promo", "Sale")


@dataclass
class ParsedPrice:
    gtin: str
    name: str
    manufacturer: str = ""
    price: float = 0.0
    unit_price: Optional[float] = None
    unit_of_measure: str = ""
    quantity: Optional[float] = None
    item_type: Optional[str] = None
    chain_id: str = ""
    store_id: str = ""
    updated_at: Optional[str] = None


@dataclass
class ParsedPromo:
    promotion_id: str
    description: str
    gtins: List[str] = field(default_factory=list)
    discounted_price: Optional[float] = None
    discount_rate: Optional[float] = None
    min_qty: float = 1.0
    reward_type: Optional[str] = None
    is_club_only: bool = False
    club_ids: List[str] = field(default_factory=list)
    start: Optional[str] = None
    end: Optional[str] = None
    chain_id: str = ""
    store_id: str = ""


# --------------------------------------------------------------------------- #
#  Low-level helpers
# --------------------------------------------------------------------------- #
def _text(node: ET.Element, *names: str) -> str:
    """First non-empty child matching any alias, case-insensitive."""
    lowered = {c.tag.lower(): (c.text or "").strip() for c in node}
    for n in names:
        v = lowered.get(n.lower())
        if v:
            return v
    return ""


def _float(node: ET.Element, *names: str) -> Optional[float]:
    raw = _text(node, *names).replace(",", "")
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def open_price_file(path: str | Path) -> bytes:
    """Reads .gz or plain .xml and returns raw bytes."""
    path = Path(path)
    data = path.read_bytes()
    if path.suffix.lower() == ".gz" or data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    return data


def describe_file(filename: str) -> dict:
    """PriceFull7290027600007-001-202610120800.gz -> structured metadata."""
    m = FILE_PATTERN.match(Path(filename).name)
    if not m:
        return {"kind": "unknown", "filename": filename}
    ts = m.group("ts")
    parsed_ts = None
    if ts:
        for fmt in ("%Y%m%d%H%M%S", "%Y%m%d%H%M"):
            try:
                parsed_ts = datetime.strptime(ts, fmt).isoformat()
                break
            except ValueError:
                continue
    kind = m.group("kind")
    return {
        "kind": kind,
        "is_full": kind.lower().endswith("full"),
        "chain_id": m.group("chain"),
        "store_id": m.group("store"),
        "timestamp": parsed_ts,
        "filename": Path(filename).name,
    }


def normalize_gtin(raw: str) -> str:
    """Strip padding/suffixes so the same product matches across chains."""
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return ""
    digits = digits.lstrip("0") or "0"
    if len(digits) < 13:
        digits = digits.rjust(13, "0")
    return digits[-13:]


# --------------------------------------------------------------------------- #
#  Parsers
# --------------------------------------------------------------------------- #
def parse_prices(source: bytes | str | Path) -> Iterator[ParsedPrice]:
    """Parse a PriceFull / Price document into ParsedPrice records."""
    data = source if isinstance(source, bytes) else open_price_file(source)
    root = ET.parse(io.BytesIO(data)).getroot()
    chain_id = _text(root, "ChainId", "ChainID") or ""
    store_id = _text(root, "StoreId", "StoreID") or ""
    for node in root.iter():
        if node.tag not in ITEM_TAGS:
            continue
        gtin = normalize_gtin(_text(node, "ItemCode", "ItemId", "Barcode"))
        if not gtin:
            continue
        yield ParsedPrice(
            gtin=gtin,
            name=_text(node, "ItemName", "ItemNm", "ProductName"),
            manufacturer=_text(node, "ManufacturerName", "ManufactureName", "Manufacturer"),
            price=_float(node, "ItemPrice", "Price") or 0.0,
            unit_price=_float(node, "UnitOfMeasurePrice", "UnitPrice"),
            unit_of_measure=_text(node, "UnitOfMeasure", "UnitQty", "UnitMeasure"),
            quantity=_float(node, "Quantity", "QtyInPackage"),
            item_type=_text(node, "ItemType"),
            chain_id=chain_id or _text(node, "ChainId"),
            store_id=store_id or _text(node, "StoreId"),
            updated_at=_text(node, "PriceUpdateDate", "UpdateDate") or None,
        )


def parse_promos(source: bytes | str | Path) -> Iterator[ParsedPromo]:
    """Parse a PromoFull / Promo document, including ClubDiscount tags."""
    data = source if isinstance(source, bytes) else open_price_file(source)
    root = ET.parse(io.BytesIO(data)).getroot()
    chain_id = _text(root, "ChainId", "ChainID") or ""
    store_id = _text(root, "StoreId", "StoreID") or ""
    for node in root.iter():
        if node.tag not in PROMO_TAGS:
            continue
        gtins = [normalize_gtin(_text(it, "ItemCode", "ItemId"))
                 for it in node.iter() if it.tag in ("Item", "PromotionItem")]
        gtins = [g for g in gtins if g]
        clubs = [(c.text or "").strip() for c in node.iter()
                 if c.tag in ("ClubId", "ClubID") and (c.text or "").strip()]
        discount_type = _text(node, "DiscountType")
        yield ParsedPromo(
            promotion_id=_text(node, "PromotionId", "PromoId", "PromotionID"),
            description=_text(node, "PromotionDescription", "PromoDescription", "Description"),
            gtins=gtins,
            discounted_price=_float(node, "DiscountedPrice", "PromotionPrice", "SalePrice"),
            discount_rate=_float(node, "DiscountRate", "DiscountPercent"),
            min_qty=_float(node, "MinQty", "MinQuantity") or 1.0,
            reward_type=_text(node, "RewardType") or discount_type or None,
            is_club_only=bool(clubs) and any(c not in ("0", "") for c in clubs),
            club_ids=clubs,
            start=_text(node, "PromotionStartDate", "StartDate") or None,
            end=_text(node, "PromotionEndDate", "EndDate") or None,
            chain_id=chain_id,
            store_id=store_id,
        )


# --------------------------------------------------------------------------- #
#  Ingestion
# --------------------------------------------------------------------------- #
def merge_into_catalog(catalog, store_id: str, prices: Iterable[ParsedPrice],
                       promos: Iterable[ParsedPromo] = ()) -> dict:
    """Match parsed records onto the catalogue by GTIN and update store prices.

    Returns an ingestion report. Unknown barcodes are reported rather than
    inserted blindly - new SKUs go through a review queue in production.
    """
    matched, unknown, updated_promos = 0, [], 0
    for rec in prices:
        product = catalog.by_gtin.get(rec.gtin)
        if not product:
            unknown.append({"gtin": rec.gtin, "name": rec.name, "price": rec.price})
            continue
        if rec.price > 0:
            product["prices"][store_id] = round(rec.price, 2)
            matched += 1

    for promo in promos:
        for gtin in promo.gtins:
            product = catalog.by_gtin.get(gtin)
            if not product or promo.discounted_price is None:
                continue
            base = product["prices"].get(store_id)
            if not base:
                continue
            pct = int(round((1 - promo.discounted_price / base) * 100)) if base else 0
            product.setdefault("promos", {})[store_id] = {
                "is_on_promo": True,
                "promo_price": round(promo.discounted_price, 2),
                "discount_pct": max(pct, 0),
                "description": promo.description or f"מבצע {max(pct, 0)}% הנחה",
                "club_id": promo.club_ids[0] if promo.club_ids else None,
                "is_club_only": promo.is_club_only,
            }
            updated_promos += 1

    return {
        "store_id": store_id,
        "prices_matched": matched,
        "promos_applied": updated_promos,
        "unknown_barcodes": len(unknown),
        "unknown_sample": unknown[:10],
        "ingested_at": datetime.utcnow().isoformat(timespec="seconds"),
    }
