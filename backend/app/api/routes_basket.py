"""Knapsack basket generation, swap/lock, checkout."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.knapsack import CATEGORY_WEIGHTS, build_basket_payload, find_swap, generate_basket
from app.models.schemas import Basket, BasketRequest, CartItem, SwapRequest
from app.services import insights
from app.services.catalog import Catalog, get_catalog
from app.services.comparison import build_comparison

router = APIRouter(prefix="/api/basket", tags=["basket"])


@router.post("/generate", response_model=Basket)
def generate(req: BasketRequest, catalog: Catalog = Depends(get_catalog)):
    """Build a balanced cart that lands between 98% and 100% of the target budget."""
    try:
        return generate_basket(
            catalog,
            target_budget=req.target_budget,
            store_id=req.store_id,
            category_focus=req.category_focus.value,
            clubs=req.clubs,
            locked=[l.model_dump() for l in req.locked],
            exclude_gtins=req.exclude_gtins,
            pantry_gtins=req.pantry_gtins,
            healthy_only=req.healthy_only,
            include_delivery_in_budget=req.include_delivery_in_budget,
            holiday_id=req.holiday_id,
            season_id=req.season_id,
            seed=req.seed,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/shuffle", response_model=Basket)
def shuffle(req: BasketRequest, catalog: Catalog = Depends(get_catalog)):
    """Regenerate while keeping every locked item in place."""
    req.seed = (req.seed or 0) + 1
    return generate(req, catalog)


@router.post("/swap", response_model=CartItem)
def swap(req: SwapRequest, catalog: Catalog = Depends(get_catalog)):
    """Find an equivalent / cheaper / healthier product at the same store."""
    item = find_swap(catalog, req.gtin, req.store_id, req.clubs, req.direction, req.exclude)
    if not item and req.direction != "equivalent":
        item = find_swap(catalog, req.gtin, req.store_id, req.clubs, "equivalent", req.exclude)
    if item:
        return item

    # Distinguish "no alternative exists" from "every alternative is already in
    # the cart" - with the seed catalogue a large basket holds most of a
    # category, and a generic error would read as a broken button.
    if req.exclude and find_swap(catalog, req.gtin, req.store_id, req.clubs, "equivalent"):
        raise HTTPException(status_code=409,
                            detail="כל החלופות המקבילות כבר נמצאות בסל שלך")
    raise HTTPException(status_code=404, detail="לא נמצאה חלופה מתאימה למוצר הזה")


@router.post("/price", response_model=Basket)
def price_cart(req: BasketRequest, catalog: Catalog = Depends(get_catalog)):
    """Re-price an existing cart (after manual edits) without regenerating it."""
    items = []
    for lock in req.locked:
        product = catalog.by_gtin.get(lock.gtin)
        if product:
            items.append(catalog.to_cart_item(product, req.store_id, lock.qty, req.clubs,
                                              locked=True, source="manual"))
    return build_basket_payload(catalog, items, store=catalog.store(req.store_id),
                                target_budget=req.target_budget,
                                include_delivery_in_budget=req.include_delivery_in_budget,
                                clubs=req.clubs)


@router.post("/checkout")
def checkout(req: BasketRequest, user_id: str = "demo", catalog: Catalog = Depends(get_catalog)):
    """Log the savings, stock the virtual pantry and suggest leftovers."""
    basket = price_cart(req, catalog)
    items = [{"gtin": l.gtin, "qty": l.qty} for l in req.locked]
    comparison = build_comparison(catalog, items, req.clubs)
    insights.record_basket(user_id, basket, comparison)
    insights.stock_cart(catalog, user_id, basket["items"])
    return {
        "basket": basket,
        "comparison": comparison,
        "savings": insights.savings_summary(user_id),
        "leftover_ideas": insights.leftover_ideas(catalog, [i["gtin"] for i in basket["items"]]),
    }


@router.get("/presets")
def presets(catalog: Catalog = Depends(get_catalog)):
    """Holiday / season presets and the category weights behind each focus."""
    return {
        "holidays": catalog.holidays_raw["presets"],
        "seasons": catalog.holidays_raw["seasons"],
        "category_weights": CATEGORY_WEIGHTS,
        "quick_budgets": [150, 300, 500, 800],
    }
