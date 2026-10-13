"""CartFit (סל-פיקס) - FastAPI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (routes_basket, routes_comparison, routes_meals, routes_prices,
                     routes_smart, routes_user)
from app.core.config import settings
from app.core.db import init_db
from app.services.catalog import get_catalog

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create the tables and warm the catalogue cache before serving."""
    init_db()
    get_catalog()
    yield


app = FastAPI(title=settings.app_name, version=settings.version,
              description=settings.description, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_basket.router)
app.include_router(routes_meals.router)
app.include_router(routes_comparison.router)
app.include_router(routes_prices.router)
app.include_router(routes_smart.router)
app.include_router(routes_user.router)


@app.get("/")
def root():
    catalog = get_catalog()
    return {
        "app": "CartFit / סל-פיקס",
        "version": settings.version,
        "docs": "/docs",
        "catalog": {"products": len(catalog.products), "stores": len(catalog.stores),
                    "recipes": len(catalog.recipes)},
    }


@app.get("/health")
def health():
    return {"status": "ok"}
