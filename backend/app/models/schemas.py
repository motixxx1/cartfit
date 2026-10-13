"""Pydantic schemas shared by every CartFit endpoint."""
from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
#  Enums
# --------------------------------------------------------------------------- #
class Category(str, Enum):
    fresh = "fresh"
    protein = "protein"
    pantry = "pantry"
    snacks = "snacks"
    extra = "extra"


class CategoryFocus(str, Enum):
    balanced = "balanced"
    pantry = "pantry"
    weekend = "weekend"


class SubstitutePolicy(str, Enum):
    brand_alternative = "brand_alternative"   # "אם חסר - קח מותג אחר באותו מחיר"
    size_upgrade = "size_upgrade"             # "קח גודל גדול יותר"
    do_not_replace = "do_not_replace"         # "אל תחליף כלל"


# --------------------------------------------------------------------------- #
#  Catalog
# --------------------------------------------------------------------------- #
class Store(BaseModel):
    id: str
    name: str
    short: str
    delivery_fee: float
    min_online_order: float = 0
    color: str = "#10B981"
    chain_id: Optional[str] = None
    online_url: Optional[str] = None
    pickup_available: bool = True


class Club(BaseModel):
    id: str
    name: str
    store_id: str
    annual_fee: float = 0.0


class WarningLabel(BaseModel):
    code: str
    label_he: str


class Nutrition(BaseModel):
    per: str = "100g"
    calories: float = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    sat_fat_g: float = 0
    sugar_g: float = 0
    sodium_mg: float = 0


class Bundle(BaseModel):
    type: str = "n_for_price"
    n: int
    bundle_price: float
    effective_unit_price: float
    description: str


class Promo(BaseModel):
    is_on_promo: bool = True
    promo_price: float
    discount_pct: int
    description: str
    club_id: Optional[str] = None
    is_club_only: bool = False


class Product(BaseModel):
    gtin: str = Field(..., description="ברקוד GTIN-13")
    name: str
    brand: str
    category: Category
    unit_label: str
    pack_size: float
    pack_unit: str
    base_price: float
    staple_score: int = 5
    tags: List[str] = []
    prices: Dict[str, float] = {}
    promos: Dict[str, Promo] = {}
    bundles: Dict[str, Bundle] = {}
    shelf_life_days: int = 30
    is_frozen: bool = False
    is_sponsored: bool = False
    sponsor_boost: int = 0
    nutrition: Optional[Nutrition] = None
    warning_labels: List[WarningLabel] = []
    health_score: Optional[int] = None
    holiday_tags: List[str] = []
    season_tags: List[str] = []
    kosher_pesach: bool = True


class CartItem(BaseModel):
    gtin: str
    name: str
    brand: str
    category: Category
    unit_label: str
    pack_size: float
    pack_unit: str
    qty: int = 1
    list_price: float
    unit_price: float
    line_total: float
    saved: float = 0.0
    is_on_promo: bool = False
    promo_description: Optional[str] = None
    is_club_promo: bool = False
    club_id: Optional[str] = None
    bundle_description: Optional[str] = None
    bundle_hint: Optional[str] = None
    is_sponsored: bool = False
    locked: bool = False
    warning_labels: List[WarningLabel] = []
    health_score: Optional[int] = None
    shelf_life_days: int = 30
    substitute_policy: SubstitutePolicy = SubstitutePolicy.brand_alternative
    note: Optional[str] = None
    source: str = "knapsack"


class CategoryBreakdown(BaseModel):
    category: Category
    label_he: str
    total: float
    pct: float
    items: int


class DeliveryInfo(BaseModel):
    delivery_fee: float
    min_online_order: float
    meets_minimum: bool
    included_in_budget: bool
    message_he: Optional[str] = None


class Basket(BaseModel):
    store_id: str
    store_name: str
    target_budget: float
    items_total: float
    delivery: DeliveryInfo
    grand_total: float
    remaining: float
    utilization_pct: float
    total_saved: float
    items: List[CartItem]
    breakdown: List[CategoryBreakdown]
    nutrition_summary: Dict[str, float] = {}
    warnings_count: int = 0
    filler_suggestions: List[CartItem] = []
    message_he: Optional[str] = None
    seed: int = 0


# --------------------------------------------------------------------------- #
#  Requests
# --------------------------------------------------------------------------- #
class LockedItem(BaseModel):
    gtin: str
    qty: int = 1


class BasketRequest(BaseModel):
    target_budget: float = Field(350, ge=20, le=5000)
    store_id: str = "shufersal"
    category_focus: CategoryFocus = CategoryFocus.balanced
    clubs: List[str] = []
    locked: List[LockedItem] = []
    exclude_gtins: List[str] = []
    pantry_gtins: List[str] = []
    healthy_only: bool = False
    include_delivery_in_budget: bool = False
    holiday_id: Optional[str] = None
    season_id: Optional[str] = None
    seed: int = 0


class SwapRequest(BaseModel):
    gtin: str
    store_id: str
    clubs: List[str] = []
    direction: str = "equivalent"   # equivalent | cheaper | healthier
    exclude: List[str] = []         # gtins already in the cart


class CompareRequest(BaseModel):
    items: List[LockedItem]
    clubs: List[str] = []
    include_delivery: bool = True
    allow_split: bool = False


class StoreComparison(BaseModel):
    store_id: str
    store_name: str
    color: str
    items_total: float
    delivery_fee: float
    grand_total: float
    missing_items: int = 0
    promo_savings: float = 0
    diff_from_best: float = 0
    is_best: bool = False
    meets_minimum: bool = True


class SplitAssignment(BaseModel):
    store_id: str
    store_name: str
    items: List[CartItem]
    items_total: float
    delivery_fee: float


class ComparisonResult(BaseModel):
    stores: List[StoreComparison]
    best_store_id: str
    worst_total: float
    best_total: float
    max_saving: float
    split: Optional[List[SplitAssignment]] = None
    split_total: Optional[float] = None
    split_saving: Optional[float] = None
    split_requires_pro: bool = True


# --------------------------------------------------------------------------- #
#  Meals
# --------------------------------------------------------------------------- #
class RecipeStep(BaseModel):
    order: int
    title: str
    desc: str
    duration_min: int
    tip: Optional[str] = None


class MealRequest(BaseModel):
    recipe_id: str = "shawarma"
    store_id: str = "shufersal"
    adults_count: int = Field(4, ge=0, le=60)
    kids_count: int = Field(0, ge=0, le=60)
    sides: List[str] = []
    pantry_keys: List[str] = []        # "יש לי בבית" - excluded from the cart
    clubs: List[str] = []
    budget_cap: Optional[float] = None


class MealResult(BaseModel):
    recipe_id: str
    title: str
    emoji: str
    servings: float
    adults_count: int
    kids_count: int
    store_id: str
    store_name: str
    items: List[CartItem]
    excluded_pantry: List[str] = []
    total: float
    per_serving: float
    delivery_benchmark_per_person: float
    delivery_total: float
    saving_vs_delivery: float
    saving_pct: int
    badge_he: str
    steps: List[RecipeStep]
    total_time_min: int
    nutrition_per_serving: Dict[str, float] = {}
    quantities: List[Dict[str, object]] = []
    over_budget: bool = False


# --------------------------------------------------------------------------- #
#  Phase 7-10 payloads
# --------------------------------------------------------------------------- #
class ScanRequest(BaseModel):
    gtin: str
    store_id: Optional[str] = None
    clubs: List[str] = []
    current_total: float = 0
    target_budget: float = 0


class ScanResult(BaseModel):
    found: bool
    product: Optional[Product] = None
    prices: List[StoreComparison] = []
    cheapest_store_id: Optional[str] = None
    fits_budget: bool = True
    budget_message_he: Optional[str] = None


class ReceiptRequest(BaseModel):
    text: str
    store_id: Optional[str] = None


class RecipeImportRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None
    store_id: str = "shufersal"
    servings: int = 4


class SavingsEntry(BaseModel):
    date: str
    store_id: str
    items_total: float
    worst_total: float
    promo_saved: float
    saved: float


class SavingsSummary(BaseModel):
    month: str
    total_saved: float
    promo_saved: float
    store_switch_saved: float
    baskets: int
    entries: List[SavingsEntry] = []
    headline_he: str = ""
    personal_inflation_pct: Optional[float] = None


class WatchlistItem(BaseModel):
    gtin: str
    name: str
    best_store_id: str
    best_price: float
    reference_price: float
    drop_pct: int
    is_on_promo: bool
    description: Optional[str] = None


class ShareResponse(BaseModel):
    code: str
    url: str
    expires_days: int = 30
