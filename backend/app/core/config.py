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

    # cors — a comma-separated env string, because a JSON list in an env var is
    # a common source of start-up crashes on hosted platforms.
    cors_origins: str = "*"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()] or ["*"]

    @property
    def sqlite_path(self) -> Path:
        """Filesystem path behind database_url, for the stdlib sqlite3 layer.

        Hosted deployments mount a volume and pass
        DATABASE_URL=sqlite:////data/cartfit.db; anything non-sqlite falls back
        to a local file so the app still starts.
        """
        url = self.database_url
        if url.startswith("sqlite:///"):
            return Path(url[len("sqlite:///"):]).expanduser()
        return BASE_DIR.parent / "cartfit.db"


settings = Settings()
