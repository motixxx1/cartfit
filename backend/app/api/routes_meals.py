"""Meal-to-Cart: diners -> grams -> SKUs -> cooking guide, plus community meals."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core import db
from app.models.schemas import MealRequest, MealResult
from app.services.catalog import Catalog, get_catalog
from app.services.meal_engine import calculate_meal, servings_for

router = APIRouter(prefix="/api/meals", tags=["meals"])


@router.get("/recipes")
def recipes(catalog: Catalog = Depends(get_catalog)):
    """Dishes and sides offered by the chef mode."""
    return {
        "recipes": [{
            "id": r["id"], "title": r["title"], "emoji": r.get("emoji"),
            "default_sides": r.get("default_sides", []),
            "delivery_benchmark_per_person": r.get("delivery_benchmark_per_person"),
            "steps_count": len(r["steps"]),
            "total_time_min": sum(s["duration_min"] for s in r["steps"]),
        } for r in catalog.recipes_raw["recipes"]],
        "sides": catalog.recipes_raw["sides"],
        "scaling_rule": catalog.recipes_raw["meta"]["scaling_rule"],
    }


@router.post("/calculate", response_model=MealResult)
def calculate(req: MealRequest, catalog: Catalog = Depends(get_catalog)):
    try:
        return calculate_meal(
            catalog, recipe_id=req.recipe_id, store_id=req.store_id,
            adults_count=req.adults_count, kids_count=req.kids_count,
            sides=req.sides, pantry_keys=req.pantry_keys, clubs=req.clubs,
            budget_cap=req.budget_cap,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/servings")
def servings(adults: int = 4, kids: int = 0):
    """adults + kids*0.6"""
    return {"adults": adults, "kids": kids, "servings": servings_for(adults, kids)}


class CommunityMeal(BaseModel):
    title: str
    servings: int
    budget: float
    payload: dict
    author: str = "משתמש CartFit"


@router.get("/community")
def community_feed():
    """'ארוחת שישי ל-6 אנשים ב-₪150' - carts other users shared."""
    return {"meals": db.community_list()}


@router.post("/community")
def community_share(meal: CommunityMeal):
    meal_id = db.community_add(meal.title, meal.servings, meal.budget, meal.payload, meal.author)
    return {"id": meal_id, "ok": True}


@router.post("/community/{meal_id}/like")
def community_like(meal_id: int):
    db.community_like(meal_id)
    return {"ok": True}
