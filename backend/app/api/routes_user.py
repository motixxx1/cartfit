"""Phase 7/8/10 user state: savings, watchlist, pantry, sharing, Pro."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core import db
from app.core.config import settings
from app.services import insights
from app.services.catalog import Catalog, get_catalog

router = APIRouter(prefix="/api/user", tags=["user"])


# ----------------------------- savings ------------------------------------ #
@router.get("/savings")
def savings(user_id: str = "demo", month: Optional[str] = None):
    data = insights.savings_summary(user_id, month)
    data["category_split"] = insights.monthly_category_split(user_id, month)
    return data


# ----------------------------- watchlist ---------------------------------- #
class WatchRequest(BaseModel):
    gtin: str
    store_id: Optional[str] = None
    clubs: List[str] = []


@router.get("/watchlist")
def watchlist(user_id: str = "demo", is_pro: bool = False, catalog: Catalog = Depends(get_catalog)):
    return insights.watchlist_status(catalog, user_id, is_pro=is_pro)


@router.post("/watchlist")
def watch_add(req: WatchRequest, user_id: str = "demo", is_pro: bool = False,
              catalog: Catalog = Depends(get_catalog)):
    product = catalog.by_gtin.get(req.gtin)
    if not product:
        raise HTTPException(status_code=404, detail="מוצר לא נמצא")
    current = insights.watchlist_status(catalog, user_id, is_pro=is_pro)
    if current["limit_reached"]:
        raise HTTPException(status_code=402,
                            detail=f"מעקב חינם מוגבל ל-{insights.PRO_WATCHLIST_LIMIT_FREE} מוצרים. "
                                   f"CartFit Pro ב-{settings.pro_price_monthly} ₪ פותח מעקב ללא הגבלה")
    _, price = catalog.best_store_for(product, req.clubs)
    db.watch_add(user_id, req.gtin, price)
    return {"ok": True, "gtin": req.gtin, "reference_price": price}


@router.delete("/watchlist/{gtin}")
def watch_remove(gtin: str, user_id: str = "demo"):
    db.watch_remove(user_id, gtin)
    return {"ok": True}


# ----------------------------- pantry ------------------------------------- #
class PantryRequest(BaseModel):
    gtin: str
    qty: int = 1


@router.get("/pantry")
def pantry(user_id: str = "demo", catalog: Catalog = Depends(get_catalog)):
    status = insights.pantry_status(catalog, user_id)
    status["leftover_ideas"] = insights.leftover_ideas(
        catalog, [i["gtin"] for i in status["items"]], limit=4)
    return status


@router.post("/pantry")
def pantry_add(req: PantryRequest, user_id: str = "demo", catalog: Catalog = Depends(get_catalog)):
    added = insights.stock_cart(catalog, user_id, [{"gtin": req.gtin, "qty": req.qty}])
    if not added:
        raise HTTPException(status_code=404, detail="מוצר לא נמצא")
    return {"ok": True}


@router.delete("/pantry/{gtin}")
def pantry_remove(gtin: str, user_id: str = "demo"):
    db.pantry_remove(user_id, gtin)
    return {"ok": True}


# ----------------------------- shared cart -------------------------------- #
class SharePayload(BaseModel):
    payload: dict
    code: Optional[str] = None


@router.post("/share")
def share_create(body: SharePayload):
    """Household cart: one short code both partners load (/cart?share=XYZ)."""
    code = db.share_put(body.payload, body.code)
    return {"code": code, "url": f"/cart?share={code}", "expires_days": 30}


@router.get("/share/{code}")
def share_read(code: str):
    data = db.share_get(code)
    if not data:
        raise HTTPException(status_code=404, detail="קוד שיתוף לא נמצא")
    return data


# ----------------------------- plan --------------------------------------- #
@router.get("/plan")
def plan():
    return {
        "free": {
            "price": 0,
            "features": ["סל חכם לפי תקציב", "מצב שף", "השוואת מחירים בין רשתות",
                         f"מעקב מחירים עד {insights.PRO_WATCHLIST_LIMIT_FREE} מוצרים"],
        },
        "pro": {
            "price": settings.pro_price_monthly,
            "features": ["מעקב מחירים ללא הגבלה + התראות Push", "סל מפוצל בין שתי רשתות",
                         "שמירת מתכונים ללא הגבלה", "ללא מוצרים ממומנים"],
        },
    }
