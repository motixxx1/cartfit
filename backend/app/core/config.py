"""Application configuration for the CartFit backend."""
from __future__ import annotations

from pathlib import Path
from typing import List

try:  # pydantic-settings is optional at runtime
    from pydantic_settings import BaseSettings
except Exception:  # pragma: no cover - fallback for minimal installs
    from pydantic import BaseModel as BaseSettings  # type: ignore


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    app_name: str = "CartFit API"
    version: str = "1.0.0"
    description: str = "סל-פיקס - בניית סל קניות חכם לפי תקציב, ארוחות ומחירי רשתות"

    # data
    products_file: Path = DATA_DIR / "seed_products.json"
    recipes_file: Path = DATA_DIR / "seed_recipes.json"
    holidays_file: Path = DATA_DIR / "seed_holidays.json"
    database_url: str = "sqlite:///./cartfit.db"

    # algorithm
    budget_min: float = 50.0
    budget_max: float = 1500.0
    fill_target_ratio: float = 0.98          # aim for 98%-100% of the target budget
    price_resolution: int = 10               # knapsack granularity, in agorot (0.1 ILS)

    # business rules
    pro_price_monthly: float = 9.90
    affiliate_tag: str = "cartfit"

    # cors
    cors_origins: List[str] = ["*"]


settings = Settings()
