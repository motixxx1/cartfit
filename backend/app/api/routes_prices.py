"""Catalogue access and the Israeli price-transparency ingestion pipeline."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.services.catalog import CATEGORY_LABELS_HE, Catalog, get_catalog
from app.services.xml_parser import (CHAIN_PORTALS, describe_file, merge_into_catalog,
                                     parse_prices, parse_promos)

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.get("/stores")
def stores(catalog: Catalog = Depends(get_catalog)):
    return {"stores": catalog.stores, "clubs": catalog.clubs,
            "categories": [{"id": k, "label_he": v} for k, v in CATEGORY_LABELS_HE.items()]}


@router.get("/products")
def products(q: Optional[str] = None, category: Optional[str] = None, tag: Optional[str] = None,
             store_id: Optional[str] = None, limit: int = Query(60, le=500),
             catalog: Catalog = Depends(get_catalog)):
    rows = catalog.products
    if q:
        rows = catalog.search(q, limit=limit)
    if category:
        rows = [p for p in rows if p["category"] == category]
    if tag:
        rows = [p for p in rows if tag in p["tags"]]
    if store_id:
        rows = [p for p in rows if store_id in p["prices"]]
    return {"count": len(rows[:limit]), "products": rows[:limit]}


@router.get("/product/{gtin}")
def product(gtin: str, catalog: Catalog = Depends(get_catalog)):
    p = catalog.by_gtin.get(gtin)
    if not p:
        raise HTTPException(status_code=404, detail="ברקוד לא נמצא בקטלוג")
    return p


@router.get("/sources")
def sources():
    """Where the PriceFull / PromoFull files come from, per chain."""
    return {"chains": CHAIN_PORTALS,
            "file_kinds": ["PriceFull", "Price", "PromoFull", "Promo", "StoresFull"],
            "matching_key": "GTIN (ItemCode)",
            "note": "קבצי חוק המזון מתפרסמים כל מספר שעות בפורמט XML דחוס ב-GZ"}


@router.get("/describe")
def describe(filename: str):
    """PriceFull7290027600007-001-202610120800.gz -> chain, branch, timestamp."""
    return describe_file(filename)


@router.post("/ingest")
async def ingest(store_id: str, price_file: UploadFile = File(...),
                 promo_file: Optional[UploadFile] = File(None),
                 catalog: Catalog = Depends(get_catalog)):
    """Upload a chain's price (and promo) file; matched by barcode onto the catalogue."""
    try:
        catalog.store(store_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"רשת לא מוכרת: {store_id}")

    import gzip

    raw = await price_file.read()
    if price_file.filename.endswith(".gz") or raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    prices = list(parse_prices(raw))

    promos = []
    if promo_file is not None:
        praw = await promo_file.read()
        if promo_file.filename.endswith(".gz") or praw[:2] == b"\x1f\x8b":
            praw = gzip.decompress(praw)
        promos = list(parse_promos(praw))

    report = merge_into_catalog(catalog, store_id, prices, promos)
    report["source_files"] = [describe_file(price_file.filename)]
    if promo_file is not None:
        report["source_files"].append(describe_file(promo_file.filename))
    return report
