/* The client's single data layer.
 *
 * CartFit ships as three independent pieces: this client (Android APK and the
 * static website), the FastAPI server, and the price-ingestion pipeline. The
 * client is deliberately self-sufficient — with no NEXT_PUBLIC_API_URL set it
 * answers every call from the bundled engine and localStorage, which is what
 * the APK and the static site do. Point NEXT_PUBLIC_API_URL at a deployed
 * server and the same calls go there instead, with the local engine kept as
 * the fallback when the network is unavailable.
 */
import type { Basket, CartItem, MealResult } from "./types";
import { engine } from "./engine";
import { localStore } from "./localStore";

const BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
export const REMOTE_ENABLED = BASE.length > 0;

const FREE_WATCH_LIMIT = 3;
const DROP_ALERT_PCT = 8;
const PRO_PRICE = 9.9;

/* ----------------------------------------------------------------------- */
/*  Remote transport                                                        */
/* ----------------------------------------------------------------------- */
class ApiError extends Error {}

async function remote<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(body.detail || "שגיאת שרת");
  }
  return res.json();
}

/**
 * Try the server, fall back to the local engine.
 *
 * A 4xx from the server is a real answer (an invalid barcode, a watchlist cap)
 * and is surfaced to the caller; only a transport failure falls through to the
 * local computation, so a dropped connection in the aisle is invisible.
 */
async function call<T>(path: string, local: () => T, init?: RequestInit): Promise<T> {
  if (!REMOTE_ENABLED) return local();
  try {
    return await remote<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    return local();
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const round2 = (n: number) => Math.round(n * 100) / 100;
const ils = (n: number) => "₪" + n.toFixed(2);

/* ----------------------------------------------------------------------- */
/*  Local implementations of the server's endpoints                         */
/* ----------------------------------------------------------------------- */
const D: any = engine.D;

const localBasket = (b: any): Basket =>
  engine.generateBasket({
    target_budget: b.target_budget, store_id: b.store_id, focus: b.category_focus || "balanced",
    clubs: b.clubs || [], locked: b.locked || [], healthyOnly: !!b.healthy_only,
    includeDelivery: !!b.include_delivery_in_budget, holidayId: b.holiday_id || null,
    seasonId: b.season_id || null, seed: b.seed || 0,
  }) as Basket;

function localPriceCart(b: any): Basket {
  const items = (b.locked || [])
    .filter((l: any) => engine.byGtin[l.gtin])
    .map((l: any) => engine.toItem(engine.byGtin[l.gtin], b.store_id, l.qty, b.clubs || [],
                                  { locked: true, source: "manual" }));
  return engine.buildPayload(items, engine.storeById[b.store_id], b.target_budget,
                             !!b.include_delivery_in_budget, [], b.seed || 0) as Basket;
}

function localSavings() {
  const month = new Date().toISOString().slice(0, 7);
  const rows = localStore.savings();
  const inMonth = rows.filter((r) => r.date.startsWith(month));
  const promo = round2(inMonth.reduce((s, r) => s + r.promo_saved, 0));
  const switched = round2(inMonth.reduce((s, r) => s + Math.max(0, r.worst_total - r.items_total), 0));
  const total = round2(promo + switched);

  // personal inflation: the first month on record against the latest
  const byMonth: Record<string, number[]> = {};
  rows.forEach((r) => (byMonth[r.date.slice(0, 7)] = byMonth[r.date.slice(0, 7)] || []).push(r.items_total));
  const months = Object.keys(byMonth).sort().slice(-6);
  let inflation: number | null = null;
  if (months.length >= 2) {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const first = avg(byMonth[months[0]]);
    if (first) inflation = round2(((avg(byMonth[months[months.length - 1]]) - first) / first) * 100);
  }

  const catTotals: Record<string, number> = {};
  rows.filter((r) => r.date.startsWith(month)).forEach((r) =>
    Object.entries(r.by_category || {}).forEach(([c, v]) => (catTotals[c] = (catTotals[c] || 0) + (v as number))));
  const grand = Object.values(catTotals).reduce((a, b) => a + b, 0);

  return {
    month, total_saved: total, promo_saved: promo, store_switch_saved: switched,
    baskets: inMonth.length,
    entries: inMonth.map((r) => ({ ...r, saved: round2(r.promo_saved + Math.max(0, r.worst_total - r.items_total)) })),
    headline_he: total
      ? `החודש חסכת ₪${total.toFixed(0)} בזכות בחירת הרשת הזולה ומיצוי מבצעים`
      : "עוד לא נרשם חיסכון החודש - בנה סל כדי להתחיל לעקוב",
    personal_inflation_pct: inflation,
    category_split: Object.entries(catTotals)
      .map(([c, v]) => ({ category: c, label_he: engine.LABELS[c], total: round2(v as number),
                          pct: grand ? round2(((v as number) / grand) * 100) : 0 }))
      .sort((a, b) => b.total - a.total),
  };
}

function localWatchlist(isPro: boolean, clubs: string[] = []) {
  const items = localStore.watchlist().map((row) => {
    const product = engine.byGtin[row.gtin];
    if (!product) return null;
    const best = engine.bestStoreFor(product, clubs);
    const pr = engine.price(product, best.store_id, clubs, 1);
    const reference = row.reference_price || best.price;
    const drop = reference ? Math.round(((reference - best.price) / reference) * 100) : 0;
    return {
      gtin: row.gtin, name: product.name, best_store_id: best.store_id,
      best_store_name: engine.storeById[best.store_id].name, best_price: best.price,
      reference_price: round2(reference), drop_pct: drop, is_on_promo: !!pr.promo,
      description: pr.promo ? pr.promo.description : null,
    };
  }).filter(Boolean) as any[];

  const alerts = items.filter((i) => i.drop_pct >= DROP_ALERT_PCT || i.is_on_promo).map((i) => ({
    ...i,
    push_title: `ירידת מחיר: ${i.name}`,
    push_body: `עכשיו ב-${i.best_price.toFixed(2)} ₪ ב${i.best_store_name}`
      + (i.drop_pct > 0 ? ` (${i.drop_pct}% פחות)` : ""),
  }));

  return { items, alerts, limit: isPro ? null : FREE_WATCH_LIMIT,
           limit_reached: !isPro && items.length >= FREE_WATCH_LIMIT };
}

function localPantry() {
  const today = new Date();
  const items = localStore.pantry().map((row) => {
    const product = engine.byGtin[row.gtin];
    if (!product) return null;
    const daysLeft = Math.round((new Date(row.expires_at).getTime() - today.getTime()) / 86400000);
    return { gtin: row.gtin, name: product.name, category: product.category, qty: row.qty,
             expires_at: row.expires_at, days_left: daysLeft, tags: product.tags };
  }).filter(Boolean).sort((a: any, b: any) => a.days_left - b.days_left) as any[];

  const expiring = items.filter((i) => i.days_left <= 3);
  return {
    items, expiring_soon: expiring,
    message_he: expiring.length ? `${expiring.length} פריטים מתקרבים לתפוגה - הנה מה אפשר להכין מהם` : null,
    leftover_ideas: engine.leftoverIdeas(items.map((i) => i.gtin), 4),
  };
}

function localCheckout(b: any) {
  const items = (b.locked || []).map((l: any) => ({ gtin: l.gtin, qty: l.qty }));
  const basket = localPriceCart(b);
  const comparison = localCompare({ items, clubs: b.clubs || [], include_delivery: true, allow_split: false });

  const byCategory: Record<string, number> = {};
  basket.items.forEach((i) => (byCategory[i.category] = round2((byCategory[i.category] || 0) + i.line_total)));

  localStore.logBasket({
    date: new Date().toISOString().slice(0, 10), store_id: basket.store_id,
    items_total: basket.items_total, worst_total: comparison.worst_total,
    promo_saved: basket.total_saved, by_category: byCategory,
  });
  localStore.stock(basket.items.map((i) => ({
    gtin: i.gtin, qty: i.qty,
    shelf_life_days: engine.byGtin[i.gtin]?.shelf_life_days || 30,
  })));

  return { basket, comparison, savings: localSavings(),
           leftover_ideas: engine.leftoverIdeas(basket.items.map((i) => i.gtin), 3) };
}

function localCompare(b: any) {
  const rows = engine.compareStores(b.items, b.clubs || [], b.include_delivery !== false);
  const best = rows[0], worst = rows[rows.length - 1];
  const result: any = {
    stores: rows, best_store_id: best.store_id, best_total: best.grand_total,
    worst_total: worst.grand_total, max_saving: round2(worst.grand_total - best.grand_total),
    split: null, split_total: null, split_saving: null, split_requires_pro: true,
  };
  if (b.allow_split) {
    const sp = engine.splitBasket(b.items, b.clubs || []);
    Object.assign(result, { split: sp.split, split_total: sp.split_total,
                            split_saving: sp.split_saving, split_message_he: sp.message_he,
                            split_pickup_store_id: sp.split ? sp.split.find((r: any) => r.pickup)?.store_id : null });
  }
  return result;
}

function localScan(b: any) {
  const product = engine.byGtin[(b.gtin || "").trim()];
  if (!product) {
    return { found: false, gtin: b.gtin, message_he: "הברקוד לא נמצא בקטלוג - אפשר להוסיף אותו ידנית" };
  }
  const rows = engine.compareStores([{ gtin: product.gtin, qty: 1 }], b.clubs || [], false);
  const here = (b.store_id && rows.find((r: any) => r.store_id === b.store_id)) || rows[0];
  const cheapest = rows[0];
  const saving = round2(here.items_total - cheapest.items_total);

  let fits = true, message: string | null = null;
  if (b.target_budget) {
    const projected = (b.current_total || 0) + here.items_total;
    fits = projected <= b.target_budget;
    const left = round2(b.target_budget - projected);
    message = fits ? `נכנס בתקציב - יישארו ${ils(left)}` : `חורג מהתקציב ב-${ils(Math.abs(left))}`;
  }
  return {
    found: true, product, prices: rows, here, cheapest_store_id: cheapest.store_id,
    cheapest_saving: saving,
    cheaper_elsewhere_he: saving > 0.05 ? `ב${cheapest.store_name} זה זול ב-${ils(saving)}` : null,
    fits_budget: fits, budget_message_he: message,
  };
}

function localExport(b: any) {
  const store = engine.storeById[b.store_id];
  const items = (b.items || [])
    .filter((i: any) => engine.byGtin[i.gtin])
    .map((i: any) => engine.toItem(engine.byGtin[i.gtin], b.store_id, i.qty, b.clubs || [], {}));
  const total = round2(items.reduce((s: number, i: any) => s + i.line_total, 0));
  const notes = (b.picker_notes && b.picker_notes.length)
    ? b.picker_notes
    : ["בשר טרי בלבד", "עגבניות קשות", "ללא תחליפים בפריטים מסומנים"];
  const text = engine.whatsappText(items, store.name, total, notes, b.budget);
  return {
    whatsapp_text: text,
    whatsapp_url: "https://wa.me/?text=" + encodeURIComponent(text),
    deep_links: items.map((i: any) => ({ gtin: i.gtin, name: i.name, qty: i.qty,
                                         url: engine.deepLink(i.gtin, b.store_id) })),
    extension_payload: { version: 1, store_id: b.store_id, store_name: store.name,
                         site: store.online_url, affiliate: "cartfit",
                         lines: items.map((i: any) => ({ gtin: i.gtin, name: i.name, qty: i.qty })) },
    total,
  };
}

/* ----------------------------------------------------------------------- */
/*  Public surface — identical shapes in both modes                         */
/* ----------------------------------------------------------------------- */
export const api = {
  mode: (): "remote" | "local" => (REMOTE_ENABLED ? "remote" : "local"),

  // ------------------------------ catalogue ---------------------------- //
  stores: () => call<any>("/api/prices/stores", () => ({
    stores: D.stores, clubs: D.clubs,
    categories: Object.entries(engine.LABELS).map(([id, label_he]) => ({ id, label_he })),
  })),

  presets: () => call<any>("/api/basket/presets", () => ({
    holidays: D.holidays, seasons: D.seasons,
    category_weights: engine.CATEGORY_WEIGHTS, quick_budgets: [150, 300, 500, 800],
  })),

  products: (q: string) =>
    call<any>(`/api/prices/products?q=${encodeURIComponent(q)}`, () => {
      const needle = (q || "").trim();
      const rows = needle
        ? D.products.filter((p: any) =>
            p.name.includes(needle) || p.brand.includes(needle) || p.gtin === needle)
        : D.products;
      return { count: rows.length, products: rows.slice(0, 60) };
    }),

  // ------------------------------- basket ------------------------------ //
  generateBasket: (body: any) => call<Basket>("/api/basket/generate", () => localBasket(body), post(body)),

  shuffleBasket: (body: any) =>
    call<Basket>("/api/basket/shuffle", () => localBasket({ ...body, seed: (body.seed || 0) + 1 }), post(body)),

  priceCart: (body: any) => call<Basket>("/api/basket/price", () => localPriceCart(body), post(body)),

  swap: (body: any) =>
    call<CartItem>("/api/basket/swap", () => {
      const exclude = body.exclude || [];
      const next = engine.findSwap(body.gtin, body.store_id, body.clubs || [],
                                   body.direction || "equivalent", exclude)
        || engine.findSwap(body.gtin, body.store_id, body.clubs || [], "equivalent", exclude);
      if (next) return next as CartItem;
      // Every equivalent is already in the cart - say so rather than looking broken.
      if (exclude.length && engine.findSwap(body.gtin, body.store_id, body.clubs || [], "equivalent", [])) {
        throw new ApiError("כל החלופות המקבילות כבר נמצאות בסל שלך");
      }
      throw new ApiError("לא נמצאה חלופה מתאימה למוצר הזה");
    }, post(body)),

  checkout: (body: any, userId = "demo") =>
    call<any>(`/api/basket/checkout?user_id=${userId}`, () => localCheckout(body), post(body)),

  // -------------------------------- meals ------------------------------ //
  recipes: () => call<any>("/api/meals/recipes", () => ({
    recipes: D.recipes.map((r: any) => ({
      id: r.id, title: r.title, emoji: r.emoji, default_sides: r.default_sides || [],
      delivery_benchmark_per_person: r.delivery_benchmark_per_person,
      steps_count: r.steps.length,
      total_time_min: r.steps.reduce((s: number, x: any) => s + x.duration_min, 0),
    })),
    sides: D.sides, scaling_rule: D.scaling_rule,
  })),

  calculateMeal: (body: any) =>
    call<MealResult>("/api/meals/calculate", () => {
      const meal = engine.calculateMeal({
        recipe_id: body.recipe_id, store_id: body.store_id, adults: body.adults_count,
        kids: body.kids_count, sides: body.sides || [], pantry_keys: body.pantry_keys || [],
        clubs: body.clubs || [],
      });
      if (!meal) throw new ApiError("מתכון לא נמצא");
      return { ...meal, adults_count: meal.adults, kids_count: meal.kids,
               over_budget: !!(body.budget_cap && meal.total > body.budget_cap) } as MealResult;
    }, post(body)),

  community: () => call<any>("/api/meals/community", () => ({ meals: localStore.community() })),

  shareMeal: (body: any) =>
    call<any>("/api/meals/community", () => ({
      id: localStore.communityAdd(body.title, body.servings, body.budget, body.payload, body.author),
      ok: true,
    }), post(body)),

  likeMeal: (id: number) =>
    call<any>(`/api/meals/community/${id}/like`, () => { localStore.communityLike(id); return { ok: true }; },
              post({})),

  // ----------------------------- comparison ---------------------------- //
  compare: (body: any) => call<any>("/api/comparison", () => localCompare(body), post(body)),

  split: (body: any, isPro = false) =>
    call<any>(`/api/comparison/split?is_pro=${isPro}`, () => {
      const sp = engine.splitBasket(body.items, body.clubs || []);
      return { ...sp, requires_pro: true, unlocked: isPro, split: isPro ? sp.split : null };
    }, post(body)),

  exportCart: (body: any) => call<any>("/api/comparison/export", () => localExport(body), post(body)),

  // ---------------------------- smart input ---------------------------- //
  scan: (body: any) => call<any>("/api/smart/scan", () => localScan(body), post(body)),

  receipt: (body: any) =>
    call<any>("/api/smart/receipt", () => {
      const parsed = engine.parseReceipt(body.text, body.store_id);
      if (!parsed.items.length) throw new ApiError("לא זוהו מוצרים בקבלה");
      return { ...parsed, cheapest_today: parsed.comparison[0] };
    }, post(body)),

  importRecipe: (body: any) =>
    call<any>("/api/smart/recipe-import", () => {
      if (!body.text) throw new ApiError("ייבוא מקישור דורש חיבור לשרת - אפשר להדביק את רשימת המצרכים");
      return { ok: true, source: "text", store_id: body.store_id, servings: body.servings,
               ...engine.importRecipe(body.text, body.store_id, body.servings) };
    }, post(body)),

  voice: (text: string) =>
    call<any>("/api/smart/voice", () => {
      const intent: any = engine.parseIntent(text);
      if (intent.store_id) intent.store_name = engine.storeById[intent.store_id].name;
      if (intent.recipe_id) {
        intent.recipe_title = (D.recipes.find((r: any) => r.id === intent.recipe_id) || {}).title;
      }
      return intent;
    }, post({ text })),

  // ------------------------------ user state --------------------------- //
  savings: (userId = "demo") => call<any>(`/api/user/savings?user_id=${userId}`, localSavings),

  watchlist: (userId = "demo", isPro = false) =>
    call<any>(`/api/user/watchlist?user_id=${userId}&is_pro=${isPro}`, () => localWatchlist(isPro)),

  watch: (gtin: string, userId = "demo", isPro = false) =>
    call<any>(`/api/user/watchlist?user_id=${userId}&is_pro=${isPro}`, () => {
      const product = engine.byGtin[gtin];
      if (!product) throw new ApiError("מוצר לא נמצא");
      if (localWatchlist(isPro).limit_reached) {
        throw new ApiError(`מעקב חינם מוגבל ל-${FREE_WATCH_LIMIT} מוצרים. `
          + `CartFit Pro ב-${PRO_PRICE} ₪ פותח מעקב ללא הגבלה`);
      }
      const best = engine.bestStoreFor(product, []);
      localStore.watchAdd(gtin, best.price);
      return { ok: true, gtin, reference_price: best.price };
    }, post({ gtin })),

  unwatch: (gtin: string, userId = "demo") =>
    call<any>(`/api/user/watchlist/${gtin}?user_id=${userId}`,
              () => { localStore.watchRemove(gtin); return { ok: true }; },
              { method: "DELETE" }),

  pantry: (userId = "demo") => call<any>(`/api/user/pantry?user_id=${userId}`, localPantry),

  pantryRemove: (gtin: string, userId = "demo") =>
    call<any>(`/api/user/pantry/${gtin}?user_id=${userId}`,
              () => { localStore.pantryRemove(gtin); return { ok: true }; },
              { method: "DELETE" }),

  share: (payload: any) =>
    call<any>("/api/user/share", () => {
      const code = localStore.sharePut(payload);
      return { code, url: `/cart?share=${code}`, expires_days: 30 };
    }, post({ payload })),

  loadShare: (code: string) =>
    call<any>(`/api/user/share/${code}`, () => {
      const row = localStore.shareGet(code);
      if (!row) throw new ApiError("קוד שיתוף לא נמצא במכשיר הזה");
      return { code, ...row };
    }),

  plan: () => call<any>("/api/user/plan", () => ({
    free: { price: 0, features: ["סל חכם לפי תקציב", "מצב שף", "השוואת מחירים בין רשתות",
                                 `מעקב מחירים עד ${FREE_WATCH_LIMIT} מוצרים`] },
    pro: { price: PRO_PRICE, features: ["מעקב מחירים ללא הגבלה + התראות Push",
                                        "סל מפוצל בין שתי רשתות", "שמירת מתכונים ללא הגבלה",
                                        "ללא מוצרים ממומנים"] },
  })),

  resetLocal: () => localStore.reset(),
};
