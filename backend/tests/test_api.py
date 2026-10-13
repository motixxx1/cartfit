"""End-to-end checks over the real catalogue — no mocks, no fixtures to drift."""
from __future__ import annotations

import gzip
import io

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.catalog import get_catalog

client = TestClient(app)
BUDGETS = [50, 150, 350, 800, 1500]


@pytest.fixture(scope="module")
def catalog():
    return get_catalog()


def build(**kwargs):
    body = {"target_budget": 350, "store_id": "shufersal", "seed": 4, **kwargs}
    res = client.post("/api/basket/generate", json=body)
    assert res.status_code == 200, res.text
    return res.json()


# --------------------------------------------------------------------------- #
#  Budget guarantees - the product promise
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("budget", BUDGETS)
def test_basket_never_exceeds_budget(budget):
    basket = build(target_budget=budget)
    assert basket["grand_total"] <= budget, f"{basket['grand_total']} > {budget}"


@pytest.mark.parametrize("budget", [b for b in BUDGETS if b >= 150])
def test_basket_uses_most_of_the_budget(budget):
    basket = build(target_budget=budget)
    assert basket["utilization_pct"] >= 97, basket["utilization_pct"]


def test_tiny_budget_leaves_only_what_cannot_be_spent(catalog):
    """At ₪50 the remainder is bounded by the cheapest item on the shelf, not by
    a weakness in the filler: nothing in the catalogue would still fit."""
    basket = build(target_budget=50)
    chosen = {i["gtin"] for i in basket["items"]}
    cheapest_left = min(
        catalog.price(p, "shufersal", [], 1).total
        for p in catalog.products
        if p["gtin"] not in chosen and "shufersal" in p["prices"])
    assert basket["remaining"] < cheapest_left, (basket["remaining"], cheapest_left)


@pytest.mark.parametrize("store_id", ["shufersal", "rami_levy", "carrefour", "victory", "yohananof"])
def test_every_store_builds_a_basket(store_id):
    basket = build(store_id=store_id)
    assert basket["items"], store_id
    assert basket["grand_total"] <= 350


def test_delivery_fee_can_be_taken_out_of_the_budget():
    basket = build(target_budget=400, include_delivery_in_budget=True)
    fee = basket["delivery"]["delivery_fee"]
    assert basket["items_total"] + fee <= 400
    assert basket["grand_total"] == pytest.approx(basket["items_total"] + fee, abs=0.01)


def test_minimum_online_order_is_reported():
    basket = build(target_budget=200, store_id="rami_levy")
    assert basket["delivery"]["meets_minimum"] is False
    assert "מינימום" in basket["message_he"]


# --------------------------------------------------------------------------- #
#  Locks, shuffle, swap
# --------------------------------------------------------------------------- #
def test_locked_items_survive_a_shuffle():
    basket = build()
    locked = [{"gtin": basket["items"][0]["gtin"], "qty": 1},
              {"gtin": basket["items"][3]["gtin"], "qty": 2}]
    res = client.post("/api/basket/shuffle", json={
        "target_budget": 350, "store_id": "shufersal", "seed": 4, "locked": locked})
    kept = {i["gtin"] for i in res.json()["items"] if i["locked"]}
    assert {l["gtin"] for l in locked} <= kept


def test_swap_does_not_return_an_item_already_in_the_cart():
    basket = build()
    gtins = [i["gtin"] for i in basket["items"]]
    res = client.post("/api/basket/swap", json={
        "gtin": gtins[1], "store_id": "shufersal", "exclude": gtins})
    if res.status_code == 200:
        assert res.json()["gtin"] not in gtins
    else:
        assert res.status_code == 409 and "כבר נמצאות בסל" in res.json()["detail"]


# --------------------------------------------------------------------------- #
#  Promotions and club pricing
# --------------------------------------------------------------------------- #
def test_club_membership_lowers_the_total():
    basket = build(target_budget=400)
    items = [{"gtin": i["gtin"], "qty": i["qty"]} for i in basket["items"]]
    body = {"target_budget": 400, "store_id": "shufersal", "locked": items}
    without = client.post("/api/basket/price", json=body).json()
    with_club = client.post("/api/basket/price", json={**body, "clubs": ["shufersal_club"]}).json()
    assert with_club["items_total"] <= without["items_total"]
    assert any(i["is_club_promo"] for i in with_club["items"])


def test_multi_buy_bundle_beats_buying_singly(catalog):
    gtin, store_id, bundle = next(
        (p["gtin"], sid, b) for p in catalog.products
        for sid, b in (p.get("bundles") or {}).items())
    product = catalog.by_gtin[gtin]
    single = catalog.price(product, store_id, [], 1)
    multi = catalog.price(product, store_id, [], bundle["n"])
    assert multi.total < single.unit_price * bundle["n"]


# --------------------------------------------------------------------------- #
#  Holiday / health filters
# --------------------------------------------------------------------------- #
def test_pesach_basket_excludes_chametz(catalog):
    basket = build(target_budget=500, store_id="victory", holiday_id="pesach")
    assert all(catalog.by_gtin[i["gtin"]]["kosher_pesach"] for i in basket["items"])


def test_healthy_basket_has_no_warning_labels():
    basket = build(target_budget=400, healthy_only=True)
    assert basket["warnings_count"] == 0


# --------------------------------------------------------------------------- #
#  Meals
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("recipe_id", ["shawarma", "burger", "pizza", "bbq"])
def test_every_recipe_produces_a_cart_and_a_guide(recipe_id):
    res = client.post("/api/meals/calculate", json={
        "recipe_id": recipe_id, "store_id": "shufersal", "adults_count": 4, "kids_count": 2})
    meal = res.json()
    assert res.status_code == 200
    assert meal["items"] and meal["steps"]
    assert meal["total"] > 0 and meal["per_serving"] > 0


def test_children_count_as_six_tenths_of_a_serving():
    meal = client.post("/api/meals/calculate", json={
        "recipe_id": "shawarma", "store_id": "shufersal",
        "adults_count": 4, "kids_count": 2}).json()
    assert meal["servings"] == pytest.approx(5.2, abs=0.01)


def test_pantry_items_are_left_out_of_the_cart():
    body = {"recipe_id": "shawarma", "store_id": "shufersal", "adults_count": 4}
    full = client.post("/api/meals/calculate", json=body).json()
    trimmed = client.post("/api/meals/calculate", json={**body, "pantry_keys": ["oil", "spice"]}).json()
    assert trimmed["total"] < full["total"]
    assert trimmed["excluded_pantry"]


def test_more_diners_cost_more():
    small = client.post("/api/meals/calculate", json={
        "recipe_id": "bbq", "store_id": "shufersal", "adults_count": 2}).json()
    large = client.post("/api/meals/calculate", json={
        "recipe_id": "bbq", "store_id": "shufersal", "adults_count": 10}).json()
    assert large["total"] > small["total"]


# --------------------------------------------------------------------------- #
#  Comparison
# --------------------------------------------------------------------------- #
def test_comparison_is_sorted_and_flags_the_cheapest():
    basket = build()
    items = [{"gtin": i["gtin"], "qty": i["qty"]} for i in basket["items"]]
    result = client.post("/api/comparison", json={"items": items}).json()
    totals = [s["grand_total"] for s in result["stores"]]
    assert totals == sorted(totals)
    assert result["stores"][0]["is_best"] is True
    assert result["best_store_id"] == result["stores"][0]["store_id"]
    assert result["max_saving"] == pytest.approx(totals[-1] - totals[0], abs=0.01)


def test_split_basket_is_only_offered_when_it_actually_saves():
    basket = build(target_budget=600)
    items = [{"gtin": i["gtin"], "qty": i["qty"]} for i in basket["items"]]
    result = client.post("/api/comparison", json={"items": items, "allow_split": True}).json()
    if result["split"]:
        assert result["split_total"] < result["best_total"]
    else:
        assert result["split_saving"] <= 0


def test_split_plan_is_withheld_without_pro():
    basket = build()
    items = [{"gtin": i["gtin"], "qty": i["qty"]} for i in basket["items"]]
    free = client.post("/api/comparison/split?is_pro=false", json={"items": items}).json()
    assert free["split"] is None and free["requires_pro"] is True


# --------------------------------------------------------------------------- #
#  Smart input
# --------------------------------------------------------------------------- #
def test_hebrew_intent_extraction():
    intent = client.post("/api/smart/voice", json={
        "text": "תרכיב לי סל לשישי ב-400 שקל כולל עוף וחלות ברמי לוי"}).json()
    assert intent["budget"] == 400
    assert intent["store_id"] == "rami_levy"
    assert intent["holiday_id"] == "shabbat"
    assert "chicken" in intent["must_tags"]


def test_meal_intent_sets_diner_count():
    intent = client.post("/api/smart/voice", json={
        "text": "על האש ל-8 אנשים עם 3 ילדים"}).json()
    assert intent["recipe_id"] == "bbq"
    assert intent["adults"] == 8 and intent["kids"] == 3


def test_receipt_text_becomes_a_cart():
    res = client.post("/api/smart/receipt", json={
        "text": 'רמי לוי\nחלב תנובה 3% 1 ליטר 6.90\nבמבה 80 גרם 4.90\nסהכ 11.80'})
    parsed = res.json()
    assert res.status_code == 200
    assert parsed["matched_count"] >= 2
    assert all('סהכ' not in (i.get("note") or "") for i in parsed["items"])


def test_scan_reports_the_cheapest_store_and_budget_fit(catalog):
    gtin = catalog.products[0]["gtin"]
    res = client.post("/api/smart/scan", json={
        "gtin": gtin, "store_id": "shufersal", "current_total": 349, "target_budget": 350}).json()
    assert res["found"] is True
    assert res["cheapest_store_id"]
    assert res["budget_message_he"]


def test_unknown_barcode_is_handled():
    res = client.post("/api/smart/scan", json={"gtin": "0000000000000"}).json()
    assert res["found"] is False


# --------------------------------------------------------------------------- #
#  Price-file ingestion
# --------------------------------------------------------------------------- #
def test_gzipped_price_file_updates_the_catalogue(catalog):
    gtin = catalog.products[0]["gtin"]
    xml = f"""<?xml version="1.0" encoding="utf-8"?><Root><ChainId>7290027600007</ChainId>
    <StoreId>001</StoreId><Items>
    <Item><ItemCode>{gtin}</ItemCode><ItemName>בדיקה</ItemName><ItemPrice>3.33</ItemPrice></Item>
    <Item><ItemCode>1234567890123</ItemCode><ItemName>לא מוכר</ItemName><ItemPrice>9.90</ItemPrice></Item>
    </Items></Root>"""
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(xml.encode("utf-8"))
    res = client.post("/api/prices/ingest?store_id=shufersal", files={
        "price_file": ("PriceFull7290027600007-001-202610120800.gz", buf.getvalue(), "application/gzip")})
    report = res.json()
    assert report["prices_matched"] == 1
    assert report["unknown_barcodes"] == 1
    assert catalog.by_gtin[gtin]["prices"]["shufersal"] == 3.33


def test_price_filename_is_parsed():
    meta = client.get("/api/prices/describe",
                      params={"filename": "PromoFull7290058140886-034-20261012080000.gz"}).json()
    assert meta["kind"] == "PromoFull" and meta["is_full"] is True
    assert meta["chain_id"] == "7290058140886" and meta["store_id"] == "034"


# --------------------------------------------------------------------------- #
#  Stateful flow - what a deployed instance actually persists
# --------------------------------------------------------------------------- #
def test_checkout_records_savings_and_stocks_the_pantry():
    """Runs through the lifespan so the tables exist, as they do under uvicorn."""
    with TestClient(app) as stateful:
        basket = stateful.post("/api/basket/generate", json={
            "target_budget": 300, "store_id": "shufersal", "seed": 11}).json()
        items = [{"gtin": i["gtin"], "qty": i["qty"]} for i in basket["items"]]
        done = stateful.post("/api/basket/checkout?user_id=pytest", json={
            "target_budget": 300, "store_id": "shufersal", "locked": items}).json()

        assert done["savings"]["total_saved"] > 0
        assert done["leftover_ideas"]
        pantry = stateful.get("/api/user/pantry?user_id=pytest").json()
        assert len(pantry["items"]) == len(items)
        assert all(row["days_left"] is not None for row in pantry["items"])


def test_configured_cors_origin_is_echoed():
    with TestClient(app) as stateful:
        res = stateful.get("/health", headers={"Origin": "https://example.org"})
        assert res.headers.get("access-control-allow-origin")


# --------------------------------------------------------------------------- #
#  Service basics
# --------------------------------------------------------------------------- #
def test_health_and_root():
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/").json()["catalog"]["products"] > 0
