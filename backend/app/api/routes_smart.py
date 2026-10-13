"""Phase 7/9 smart input: barcode scan, receipt OCR text, recipe import, voice."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.schemas import ReceiptRequest, RecipeImportRequest, ScanRequest
from app.services.catalog import Catalog, get_catalog
from app.services.comparison import compare_stores
from app.services.smart_input import import_recipe, parse_intent, parse_receipt

router = APIRouter(prefix="/api/smart", tags=["smart-input"])


@router.post("/scan")
def scan(req: ScanRequest, catalog: Catalog = Depends(get_catalog)):
    """In-store barcode scan: what it costs here, what it costs elsewhere, budget check."""
    product = catalog.by_gtin.get(req.gtin.strip())
    if not product:
        return {"found": False, "gtin": req.gtin,
                "message_he": "הברקוד לא נמצא בקטלוג - אפשר להוסיף אותו ידנית"}

    rows = compare_stores(catalog, [{"gtin": product["gtin"], "qty": 1}], req.clubs, include_delivery=False)
    here = next((r for r in rows if r["store_id"] == req.store_id), rows[0]) if req.store_id else rows[0]
    cheapest = rows[0]

    fits = True
    message = None
    if req.target_budget:
        projected = req.current_total + here["items_total"]
        fits = projected <= req.target_budget
        left = req.target_budget - projected
        message = (f"נכנס בתקציב - יישארו {left:.2f} ₪" if fits
                   else f"חורג מהתקציב ב-{abs(left):.2f} ₪")
    saving = round(here["items_total"] - cheapest["items_total"], 2)
    return {
        "found": True,
        "product": product,
        "prices": rows,
        "here": here,
        "cheapest_store_id": cheapest["store_id"],
        "cheapest_saving": saving,
        "cheaper_elsewhere_he": (f"ב{cheapest['store_name']} זה זול ב-{saving:.2f} ₪" if saving > 0.05 else None),
        "fits_budget": fits,
        "budget_message_he": message,
    }


@router.post("/receipt")
def receipt(req: ReceiptRequest, catalog: Catalog = Depends(get_catalog)):
    """Receipt photo already OCR'd to text -> a repeatable cart + today's comparison."""
    parsed = parse_receipt(catalog, req.text, req.store_id)
    if not parsed["items"]:
        raise HTTPException(status_code=422, detail="לא זוהו מוצרים בקבלה")
    items = [{"gtin": i["gtin"], "qty": i["qty"]} for i in parsed["items"]]
    rows = compare_stores(catalog, items, include_delivery=False)
    parsed["comparison"] = rows
    parsed["cheapest_today"] = rows[0]
    parsed["message_he"] = (f"את אותה קנייה אפשר לעשות היום ב{rows[0]['store_name']} "
                            f"ב-{rows[0]['items_total']:.2f} ₪")
    return parsed


@router.post("/recipe-import")
def recipe_import(req: RecipeImportRequest, catalog: Catalog = Depends(get_catalog)):
    """Paste a recipe (text or URL) -> shelf products straight into the cart."""
    result = import_recipe(catalog, text=req.text, url=req.url, store_id=req.store_id,
                           servings=req.servings)
    if not result.get("ok"):
        raise HTTPException(status_code=422, detail=result.get("error", "ייבוא נכשל"))
    return result


class VoiceRequest(BaseModel):
    text: str


@router.post("/voice")
def voice(req: VoiceRequest, catalog: Catalog = Depends(get_catalog)):
    """Hebrew speech transcript -> budget, store, diners, dish, holiday."""
    intent = parse_intent(req.text)
    if intent["store_id"]:
        intent["store_name"] = catalog.store(intent["store_id"])["name"]
    if intent["recipe_id"]:
        intent["recipe_title"] = catalog.recipes[intent["recipe_id"]]["title"]
    return intent
