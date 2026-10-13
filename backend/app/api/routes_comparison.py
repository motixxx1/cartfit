"""Cross-store comparison, split-basket optimisation and cart export."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.models.schemas import CompareRequest, LockedItem
from app.services.affiliate import cart_deep_links, extension_payload, whatsapp_text, whatsapp_url
from app.services.catalog import Catalog, get_catalog
from app.services.comparison import build_comparison, split_basket

router = APIRouter(prefix="/api/comparison", tags=["comparison"])


@router.post("")
def compare(req: CompareRequest, catalog: Catalog = Depends(get_catalog)):
    """Price the same cart at Shufersal / Rami Levy / Carrefour / Victory / Yohananof."""
    return build_comparison(catalog, [i.model_dump() for i in req.items], req.clubs,
                            req.include_delivery, req.allow_split)


@router.post("/split")
def split(req: CompareRequest, is_pro: bool = False, catalog: Catalog = Depends(get_catalog)):
    """CartFit Pro: buy part of the cart at one chain and the rest at another."""
    result = split_basket(catalog, [i.model_dump() for i in req.items], req.clubs)
    result["requires_pro"] = True
    result["unlocked"] = is_pro
    if not is_pro:
        result["split"] = None          # teaser only: the saving is shown, the plan is not
    return result


class ExportRequest(BaseModel):
    items: list[LockedItem] = []
    store_id: str = "shufersal"
    budget: float | None = None
    picker_notes: list[str] = []
    clubs: list[str] = []


@router.post("/export")
def export_cart(req: ExportRequest, catalog: Catalog = Depends(get_catalog)):
    """WhatsApp checklist + per-line deep links + the Chrome extension payload."""
    store = catalog.store(req.store_id)
    items = [catalog.to_cart_item(catalog.by_gtin[i.gtin], req.store_id, i.qty, req.clubs)
             for i in req.items if i.gtin in catalog.by_gtin]
    total = round(sum(i["line_total"] for i in items), 2)
    notes = list(req.picker_notes) or ["בשר טרי בלבד", "עגבניות קשות", "ללא תחליפים בפריטים מסומנים"]
    text = whatsapp_text(items, store_name=store["name"], total=total,
                         picker_notes=notes, budget=req.budget)
    return {
        "whatsapp_text": text,
        "whatsapp_url": whatsapp_url(text),
        "deep_links": cart_deep_links(catalog, items, req.store_id),
        "extension_payload": extension_payload(catalog, items, req.store_id),
        "total": total,
    }
