/* CartFit engine — the same algorithms as the FastAPI backend, ported to the browser. */
(function () {
  const D = window.CARTFIT_DATA;
  const byGtin = Object.fromEntries(D.products.map((p) => [p.gtin, p]));
  const storeById = Object.fromEntries(D.stores.map((s) => [s.id, s]));
  const byTag = {};
  D.products.forEach((p) => p.tags.forEach((t) => (byTag[t] = byTag[t] || []).push(p)));

  const CATEGORY_WEIGHTS = {
    balanced: { fresh: 0.35, protein: 0.25, pantry: 0.2, snacks: 0.1, extra: 0.1 },
    pantry: { fresh: 0.2, protein: 0.15, pantry: 0.4, snacks: 0.1, extra: 0.15 },
    weekend: { fresh: 0.3, protein: 0.35, pantry: 0.1, snacks: 0.18, extra: 0.07 },
  };
  const LABELS = { fresh: "טרי", protein: "חלבון ובשר", pantry: "יבש ומזווה", snacks: "חטיפים ושתייה", extra: "נלווים ובית" };
  const FILLER_MAX = 16, MIN_FILL = 1.5, HEVER = "hever";

  const round2 = (n) => Math.round(n * 100) / 100;

  /* deterministic RNG so "shuffle" is reproducible per seed */
  function rng(seed) {
    let s = (seed * 2654435761) % 2147483647 || 42;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  /* ---------------- pricing: promos, club eligibility, multi-buy bundles -------- */
  function price(product, storeId, clubs, qty) {
    qty = qty || 1; clubs = clubs || [];
    const list = product.prices[storeId];
    let unit = list, promo = null, clubId = null, blocked = null;
    const pr = (product.promos || {})[storeId];
    if (pr) {
      const eligible = !pr.is_club_only || clubs.includes(pr.club_id) || clubs.includes(HEVER);
      if (eligible) { unit = pr.promo_price; promo = pr; clubId = pr.is_club_only ? pr.club_id : null; }
      else blocked = pr;
    }
    let total = round2(unit * qty), bundle = null, hint = null;
    const b = (product.bundles || {})[storeId];
    if (b) {
      if (qty >= b.n) {
        const groups = Math.floor(qty / b.n), rest = qty % b.n;
        const cand = round2(groups * b.bundle_price + rest * unit);
        if (cand < total) { total = cand; bundle = b; }
      } else if (b.bundle_price < unit * b.n) {
        hint = `עוד ${b.n - qty} והמחיר יורד ל-${b.effective_unit_price.toFixed(2)} ₪ ליחידה (${b.description})`;
      }
    }
    return { list_price: list, unit_price: unit, total, saved: round2(Math.max(0, list * qty - total)),
             promo, bundle, bundle_hint: hint, club_id: clubId, blocked_club_promo: blocked };
  }

  function toItem(product, storeId, qty, clubs, extra) {
    const pr = price(product, storeId, clubs, qty || 1);
    return Object.assign({
      gtin: product.gtin, name: product.name, brand: product.brand, category: product.category,
      unit_label: product.unit_label, pack_size: product.pack_size, pack_unit: product.pack_unit,
      qty: qty || 1, list_price: pr.list_price, unit_price: round2(pr.unit_price), line_total: pr.total,
      saved: pr.saved, is_on_promo: !!pr.promo, promo_description: pr.promo ? pr.promo.description : null,
      is_club_promo: !!pr.club_id, bundle_description: pr.bundle ? pr.bundle.description : null,
      bundle_hint: pr.bundle_hint, is_sponsored: !!product.is_sponsored, locked: false, checked: false,
      warning_labels: product.warning_labels || [], health_score: product.health_score,
      shelf_life_days: product.shelf_life_days, substitute_policy: "brand_alternative", note: null,
    }, extra || {});
  }

  function bestStoreFor(product, clubs) {
    let best = null, bestPrice = Infinity;
    Object.keys(product.prices).forEach((sid) => {
      const p = price(product, sid, clubs, 1).unit_price;
      if (p < bestPrice) { best = sid; bestPrice = p; }
    });
    return { store_id: best, price: round2(bestPrice) };
  }

  /* ---------------- utility + multiple-choice knapsack --------------------------- */
  function utility(product, pr, ctx) {
    let u = (product.staple_score || 5) * 10;
    if (pr.promo) { u += 15 + (pr.promo.discount_pct || 0) * 1.2; if (pr.club_id) u += 6; }
    u += (product.sponsor_boost || 0) * 4;
    if (ctx.holiday) {
      const tags = product.tags;
      if (tags.some((t) => (ctx.holiday.must_tags || []).includes(t))) u += 45;
      if (tags.some((t) => (ctx.holiday.boost_tags || []).includes(t))) u += 18;
    }
    if (ctx.season && product.tags.some((t) => (ctx.season.boost_tags || []).includes(t))) u += 10;
    if (product.health_score != null) u += (product.health_score - 60) * 0.12;
    if (ctx.healthyOnly && (product.warning_labels || []).length) u -= 200;
    return u * (1 + (ctx.rand() * 0.36 - 0.18));
  }

  function solveMCKP(entries, budget, resolution) {
    if (budget <= 0 || !entries.length) return [];
    const cap = Math.floor((budget * 100) / resolution);
    if (cap <= 0) return [];
    let dp = new Float64Array(cap + 1);
    const choice = entries.map(() => new Int8Array(cap + 1).fill(-1));
    entries.forEach((entry, i) => {
      const next = dp.slice(), row = choice[i];
      entry.options.forEach((opt, oi) => {
        const w = Math.ceil((opt.price * 100) / resolution);
        if (w <= 0 || w > cap) return;
        for (let c = cap; c >= w; c--) {
          const cand = dp[c - w] + opt.utility;
          if (cand > next[c] + 1e-9) { next[c] = cand; row[c] = oi; }
        }
      });
      dp = next;
    });
    let c = 0, bestVal = -Infinity;
    for (let i = 0; i <= cap; i++) if (dp[i] > bestVal) { bestVal = dp[i]; c = i; }
    const picked = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const oi = choice[i][c];
      if (oi >= 0) {
        const opt = entries[i].options[oi];
        picked.push({ product: entries[i].product, qty: opt.qty, price: opt.price });
        c = Math.max(0, c - Math.ceil((opt.price * 100) / resolution));
      }
    }
    return picked.reverse();
  }

  const resolutionFor = (b) => (b <= 400 ? 10 : b <= 900 ? 25 : 50);

  /* ---------------- basket generation ------------------------------------------- */
  function generateBasket(opts) {
    const o = Object.assign({ target_budget: 350, store_id: "shufersal", focus: "balanced", clubs: [],
      locked: [], healthyOnly: false, includeDelivery: false, holidayId: null, seasonId: null, seed: 0 }, opts);
    const store = storeById[o.store_id];
    const holiday = o.holidayId ? D.holidays.find((h) => h.id === o.holidayId) : null;
    const season = o.seasonId ? D.seasons.find((s) => s.id === o.seasonId) : null;
    const ctx = { rand: rng(o.seed + 1), healthyOnly: o.healthyOnly, holiday, season };
    let weights = CATEGORY_WEIGHTS[o.focus] || CATEGORY_WEIGHTS.balanced;
    if (holiday && CATEGORY_WEIGHTS[holiday.focus]) weights = CATEGORY_WEIGHTS[holiday.focus];

    const fee = store.delivery_fee;
    let spendable = o.target_budget - (o.includeDelivery ? fee : 0);
    const ceiling = spendable;

    const items = [], used = new Set();
    (o.locked || []).forEach((l) => {
      const p = byGtin[l.gtin];
      if (!p || used.has(l.gtin)) return;
      const item = toItem(p, o.store_id, l.qty || 1, o.clubs, { locked: true, source: "locked" });
      if (item.line_total <= spendable) { items.push(item); used.add(l.gtin); spendable -= item.line_total; }
    });

    const pool = D.products.filter((p) => {
      if (used.has(p.gtin) || !(o.store_id in p.prices)) return false;
      if (o.healthyOnly && (p.warning_labels || []).length) return false;
      if (holiday && holiday.kosher_pesach_only && !p.kosher_pesach) return false;
      return true;
    });

    const res = resolutionFor(o.target_budget);
    Object.entries(weights).forEach(([cat, weight]) => {
      const catBudget = spendable * weight;
      if (catBudget < 2) return;
      const entries = [];
      pool.filter((p) => p.category === cat).forEach((p) => {
        const options = [];
        const single = price(p, o.store_id, o.clubs, 1);
        if (single.total <= catBudget) options.push({ qty: 1, price: single.total, utility: utility(p, single, ctx) });
        const b = (p.bundles || {})[o.store_id];
        if (b) {
          const multi = price(p, o.store_id, o.clubs, b.n);
          if (multi.total <= catBudget && multi.total < single.unit_price * b.n) {
            options.push({ qty: b.n, price: multi.total, utility: utility(p, multi, ctx) * (1 + 0.22 * Math.log(b.n + 1)) });
          }
        }
        if (options.length) entries.push({ product: p, options });
      });
      solveMCKP(entries, catBudget, res).forEach((pick) => {
        items.push(toItem(pick.product, o.store_id, pick.qty, o.clubs, { source: "knapsack" }));
        used.add(pick.product.gtin);
      });
    });

    let total = round2(items.reduce((s, i) => s + i.line_total, 0));
    let remaining = round2(ceiling - total);

    /* greedy residual filler */
    for (let guard = 0; guard < 12 && remaining >= MIN_FILL; guard++) {
      let best = null;
      pool.forEach((p) => {
        if (used.has(p.gtin)) return;
        const pr = price(p, o.store_id, o.clubs, 1);
        if (pr.total > remaining || pr.total > FILLER_MAX) return;
        const score = (pr.total / remaining) * 100 + (p.tags.includes("filler") ? 20 : 0) + p.staple_score * 2 + (pr.promo ? 15 : 0);
        if (!best || score > best.score) best = { score, p };
      });
      if (!best) break;
      const item = toItem(best.p, o.store_id, 1, o.clubs, { source: "filler" });
      items.push(item); used.add(best.p.gtin);
      total = round2(total + item.line_total); remaining = round2(ceiling - total);
    }

    /* top-up staples when the catalogue runs out of novelty */
    for (let guard = 0; guard < 60 && remaining >= MIN_FILL; guard++) {
      let best = null;
      items.forEach((item) => {
        const p = byGtin[item.gtin];
        if (!p || p.staple_score < 5 || item.qty >= 6) return;
        const next = price(p, o.store_id, o.clubs, item.qty + 1);
        const delta = round2(next.total - item.line_total);
        if (delta <= 0 || delta > remaining) return;
        const score = (delta / remaining) * 100 + p.staple_score * 3 - item.qty * 6;
        if (!best || score > best.score) best = { score, item, next, delta };
      });
      if (!best) break;
      best.item.qty += 1;
      best.item.line_total = best.next.total;
      best.item.saved = best.next.saved;
      best.item.bundle_description = best.next.bundle ? best.next.bundle.description : best.item.bundle_description;
      best.item.bundle_hint = best.next.bundle_hint;
      total = round2(total + best.delta); remaining = round2(ceiling - total);
    }

    const suggestions = [];
    pool.slice().sort((a, b) => b.staple_score - a.staple_score).some((p) => {
      if (used.has(p.gtin)) return false;
      const pr = price(p, o.store_id, o.clubs, 1);
      if (pr.total <= remaining && remaining >= 1) suggestions.push(toItem(p, o.store_id, 1, o.clubs, { source: "suggestion" }));
      return suggestions.length >= 3;
    });

    return buildPayload(items, store, o.target_budget, o.includeDelivery, suggestions, o.seed);
  }

  function buildPayload(items, store, budget, includeDelivery, suggestions, seed) {
    const itemsTotal = round2(items.reduce((s, i) => s + i.line_total, 0));
    const fee = store.delivery_fee;
    const meetsMin = itemsTotal >= store.min_online_order;
    const grand = round2(itemsTotal + (includeDelivery ? fee : 0));
    const remaining = round2(budget - grand);

    const breakdown = Object.keys(LABELS).map((cat) => {
      const rows = items.filter((i) => i.category === cat);
      const total = round2(rows.reduce((s, i) => s + i.line_total, 0));
      return { category: cat, label_he: LABELS[cat], total, items: rows.length,
               pct: itemsTotal ? round2((total / itemsTotal) * 100) : 0 };
    }).filter((b) => b.total > 0).sort((a, b) => b.total - a.total);

    const nutri = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, sugar_g: 0, sodium_mg: 0 };
    items.forEach((i) => {
      const p = byGtin[i.gtin];
      if (!p || !p.nutrition) return;
      const factor = ["g", "ml"].includes(p.pack_unit) ? (p.pack_size / 100) * i.qty : i.qty;
      Object.keys(nutri).forEach((k) => (nutri[k] += (p.nutrition[k] || 0) * factor));
    });
    Object.keys(nutri).forEach((k) => (nutri[k] = Math.round(nutri[k])));

    let message = null;
    if (!meetsMin) {
      message = `מינימום להזמנת אונליין ב${store.name} הוא ${store.min_online_order} ₪ - עברו לאיסוף עצמי או הוסיפו עוד ${Math.ceil(store.min_online_order - itemsTotal)} ₪ לסל`;
    } else if (remaining >= 2) {
      const names = (suggestions || []).slice(0, 2).map((s) => s.name.split(" ").slice(0, 2).join(" ")).join(" או ");
      message = `נשארו לך ${Math.round(remaining)} ₪ - אפשר להוסיף ${names || "פריט קטן"} לסגירת התקציב`;
    } else if (remaining < 0) {
      message = `חריגה של ${Math.abs(Math.round(remaining))} ₪ מהתקציב - נעל פריטים חיוניים ולחץ ערבב מחדש`;
    }

    return { store_id: store.id, store_name: store.name, target_budget: budget, items_total: itemsTotal,
             delivery: { delivery_fee: fee, min_online_order: store.min_online_order, meets_minimum: meetsMin,
                         included_in_budget: includeDelivery },
             grand_total: grand, remaining, utilization_pct: budget ? round2((grand / budget) * 100) : 0,
             total_saved: round2(items.reduce((s, i) => s + i.saved, 0)), items, breakdown,
             nutrition_summary: nutri, warnings_count: items.filter((i) => i.warning_labels.length).length,
             filler_suggestions: suggestions || [], message_he: message, seed };
  }

  /* ---------------- swap --------------------------------------------------------- */
  function findSwap(gtin, storeId, clubs, direction, excludeGtins) {
    const current = byGtin[gtin];
    if (!current) return null;
    const curPrice = price(current, storeId, clubs, 1).total;
    const exclude = new Set([gtin].concat(excludeGtins || []));
    const tags = new Set(current.tags);
    let best = null, bestScore = -Infinity;
    D.products.forEach((p) => {
      if (exclude.has(p.gtin) || p.category !== current.category || !(storeId in p.prices)) return;
      const overlap = p.tags.filter((t) => tags.has(t)).length;
      if (!overlap) return;
      const pr = price(p, storeId, clubs, 1);
      const delta = pr.total - curPrice;
      if (direction === "cheaper" && delta >= 0) return;
      if (direction === "healthier" && (p.health_score || 0) <= (current.health_score || 0)) return;
      if (direction === "equivalent" && Math.abs(delta) > Math.max(4, curPrice * 0.25)) return;
      let score = overlap * 10 - Math.abs(delta) * 1.5 + (pr.promo ? 12 : 0) + p.staple_score;
      if (direction === "cheaper") score += -delta * 3;
      if (score > bestScore) { best = p; bestScore = score; }
    });
    return best ? toItem(best, storeId, 1, clubs, { source: "swap" }) : null;
  }

  /* ---------------- comparison + split ------------------------------------------- */
  function compareStores(items, clubs, includeDelivery) {
    const rows = D.stores.map((store) => {
      let total = 0, promoSaved = 0, missing = 0;
      items.forEach((it) => {
        const p = byGtin[it.gtin];
        if (!p || !(store.id in p.prices)) { missing++; return; }
        const pr = price(p, store.id, clubs, it.qty || 1);
        total += pr.total; promoSaved += pr.saved;
      });
      total = round2(total);
      const fee = includeDelivery ? store.delivery_fee : 0;
      return { store_id: store.id, store_name: store.name, color: store.color, items_total: total,
               delivery_fee: fee, grand_total: round2(total + fee), missing_items: missing,
               promo_savings: round2(promoSaved), meets_minimum: total >= store.min_online_order,
               diff_from_best: 0, is_best: false };
    });
    const best = rows.reduce((a, b) => (b.grand_total < a.grand_total ? b : a));
    rows.forEach((r) => { r.diff_from_best = round2(r.grand_total - best.grand_total); r.is_best = r.store_id === best.store_id; });
    return rows.sort((a, b) => a.grand_total - b.grand_total);
  }

  function splitBasket(items, clubs) {
    const norm = items.filter((i) => byGtin[i.gtin]).map((i) => ({ gtin: i.gtin, qty: i.qty || 1 }));
    const single = compareStores(norm, clubs, true);
    const bestSingle = single.length ? single[0].grand_total : 0;
    const ids = D.stores.map((s) => s.id);
    let best = null;

    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const combo = [ids[a], ids[b]];
        const assign = { [combo[0]]: [], [combo[1]]: [] };
        let sum = 0;
        norm.forEach(({ gtin, qty }) => {
          const p = byGtin[gtin];
          const sid = combo.reduce((x, y) => (price(p, y, clubs, qty).total < price(p, x, clubs, qty).total ? y : x));
          assign[sid].push({ gtin, qty });
          sum += price(p, sid, clubs, qty).total;
        });
        const used = combo.filter((sid) => assign[sid].length);
        if (used.length < 2) continue;
        const subtotal = {};
        used.forEach((sid) => (subtotal[sid] = assign[sid].reduce((s, l) => s + price(byGtin[l.gtin], sid, clubs, l.qty).total, 0)));
        const fees = used.reduce((s, sid) => s + storeById[sid].delivery_fee, 0);
        const pickup = used.reduce((x, y) => (subtotal[y] < subtotal[x] ? y : x));
        [[sum + fees, null], [sum + fees - storeById[pickup].delivery_fee, pickup]].forEach(([tot, pk]) => {
          if (!best || tot < best.total) best = { total: round2(tot), assign, used, pickup: pk };
        });
      }
    }
    if (!best) return { split: null, split_total: null, split_saving: 0, worth_it: false, best_single_total: bestSingle };

    const saving = round2(bestSingle - best.total);
    const rows = best.used.map((sid) => {
      const cartItems = best.assign[sid].map((l) => toItem(byGtin[l.gtin], sid, l.qty, clubs, { source: "split" }));
      return { store_id: sid, store_name: storeById[sid].name, items: cartItems,
               items_total: round2(cartItems.reduce((s, i) => s + i.line_total, 0)),
               delivery_fee: sid === best.pickup ? 0 : storeById[sid].delivery_fee,
               pickup: sid === best.pickup };
    }).sort((a, b) => b.items_total - a.items_total);

    let message;
    if (saving > 0) {
      message = rows.map((r) => `${r.store_name} ${r.pickup ? "באיסוף עצמי" : "במשלוח"} (${Math.round(r.items_total)} ₪)`)
                    .join(" + ") + ` - חיסכון נוסף של ${Math.round(saving)} ₪`;
    } else {
      message = `פיצול בין שתי רשתות לא משתלם לסל הזה - דמי המשלוח הכפולים מוסיפים ${Math.abs(Math.round(saving))} ₪ יותר מהחיסכון`;
    }
    return { split: saving > 0 ? rows : null, split_total: saving > 0 ? best.total : null,
             split_saving: saving, worth_it: saving > 0, best_single_total: bestSingle, message_he: message };
  }

  /* ---------------- meal engine --------------------------------------------------- */
  const packCount = (needed, packSize) => Math.max(1, Math.ceil(Math.round((needed / packSize - 0.07) * 1000) / 1000));

  function pickProduct(tag, storeId, clubs, prefer) {
    let best = null, bestScore = Infinity;
    (byTag[tag] || []).forEach((p) => {
      if (!(storeId in p.prices)) return;
      const pr = price(p, storeId, clubs, 1);
      const perUnit = pr.unit_price / (p.pack_size || 1);
      const score = prefer === "cheapest" ? pr.unit_price : perUnit * (pr.promo ? 0.9 : 1);
      if (score < bestScore) { best = p; bestScore = score; }
    });
    return best;
  }

  function calculateMeal(o) {
    const recipe = D.recipes.find((r) => r.id === o.recipe_id);
    if (!recipe) return null;
    const store = storeById[o.store_id];
    const servings = Math.round((o.adults + o.kids * 0.6) * 100) / 100;
    const pantry = new Set(o.pantry_keys || []);
    const sides = (o.sides && o.sides.length ? o.sides : recipe.default_sides) || [];

    const reqs = recipe.ingredients.map((i) => ({ key: i.key, tag: i.tag, label: i.label,
      per_person: i.per_person, unit: i.unit, role: i.role || "base", pantry_optional: !!i.pantry_optional }));
    sides.forEach((sid) => {
      const side = D.sides.find((s) => s.id === sid);
      if (!side) return;
      reqs.push({ key: sid, tag: side.tag, label: side.label, per_person: side.per_person, unit: side.unit, role: "side", pantry_optional: false });
      (side.extra || []).forEach((e) => reqs.push({ key: `${sid}_${e.tag}`, tag: e.tag, label: e.label,
        per_person: e.per_person, unit: e.unit, role: "side", pantry_optional: false }));
    });

    const merged = {};
    reqs.forEach((r) => {
      if (merged[r.tag]) merged[r.tag].per_person = Math.max(merged[r.tag].per_person, r.per_person);
      else merged[r.tag] = r;
    });

    const items = [], quantities = [], excluded = [];
    Object.values(merged).forEach((r) => {
      if (r.pantry_optional && pantry.has(r.key)) { excluded.push(r.label); return; }
      const product = pickProduct(r.tag, o.store_id, o.clubs, "value");
      if (!product) return;
      const needed = Math.round(r.per_person * servings * 10) / 10;
      const packs = packCount(needed, product.pack_size);
      const item = toItem(product, o.store_id, packs, o.clubs,
        { source: "meal", note: `${r.label}: ${needed} ${r.unit === "unit" ? "יח'" : r.unit} לכל הסועדים` });
      items.push(item);
      quantities.push({ key: r.key, label: r.label, role: r.role, needed, unit: r.unit, product: product.name,
                        gtin: product.gtin, packs, line_total: item.line_total });
    });

    const total = round2(items.reduce((s, i) => s + i.line_total, 0));
    const nutri = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, sugar_g: 0, sodium_mg: 0 };
    quantities.forEach((q) => {
      const p = byGtin[q.gtin];
      if (!p || !p.nutrition) return;
      const factor = ["g", "ml"].includes(q.unit) ? q.needed / 100 : q.needed;
      Object.keys(nutri).forEach((k) => (nutri[k] += (p.nutrition[k] || 0) * factor));
    });
    const perServingNutri = {};
    Object.keys(nutri).forEach((k) => (perServingNutri[k] = servings ? Math.round(nutri[k] / servings) : 0));

    const bench = recipe.delivery_benchmark_per_person || 70;
    const deliveryTotal = round2(bench * (o.adults + o.kids * 0.75));
    const saving = round2(Math.max(0, deliveryTotal - total));
    const savingPct = deliveryTotal ? Math.round((saving / deliveryTotal) * 100) : 0;
    const perServing = servings ? round2(total / servings) : 0;

    return { recipe_id: recipe.id, title: recipe.title, emoji: recipe.emoji, servings,
             adults: o.adults, kids: o.kids, store_id: o.store_id, store_name: store.name,
             items, quantities, excluded_pantry: excluded, total, per_serving: perServing,
             delivery_total: deliveryTotal, saving_vs_delivery: saving, saving_pct: savingPct,
             badge_he: `סה"כ: ₪${total.toFixed(0)} (רק ₪${perServing.toFixed(1)} לסועד! חיסכון של ${savingPct}% מהזמנת משלוח)`,
             steps: recipe.steps, total_time_min: recipe.steps.reduce((s, x) => s + x.duration_min, 0),
             nutrition_per_serving: perServingNutri };
  }

  /* ---------------- Hebrew intent parsing (voice / free text) --------------------- */
  const DISH_WORDS = { shawarma: ["שווארמה", "שוארמה", "פרגית"], burger: ["המבורגר", "בורגר", "קציצות"],
                       pizza: ["פיצה", "פיצות"], bbq: ["על האש", "מנגל", "ברביקיו"] };
  const STORE_WORDS = { shufersal: ["שופרסל", "שופר סל"], rami_levy: ["רמי לוי", "רמי-לוי", "רמי"],
                        carrefour: ["קרפור", "קארפור"], victory: ["ויקטורי"], yohananof: ["יוחננוף"] };
  const HOLIDAY_WORDS = { shabbat: ["שישי", "שבת"], rosh_hashana: ["ראש השנה"], pesach: ["פסח", "ליל הסדר"],
                          bbq_day: ["יום העצמאות", "לג בעומר", "מנגל"], shavuot: ["שבועות"] };
  const ITEM_WORDS = { chicken: ["עוף", "פרגית", "שניצל"], bread: ["חלות", "חלה", "לחם"],
                       drink: ["שתייה", "שתיה", "קולה", "משקאות"], veg: ["ירקות", "סלט"], fruit: ["פירות"],
                       dairy: ["חלב", "גבינות"], chips_frozen: ["צ'יפס", "ציפס"], snack: ["חטיפים"],
                       ground_beef: ["בשר טחון", "בקר"], fish: ["דגים", "סלמון"], rice: ["אורז"], pasta: ["פסטה"] };

  function parseIntent(text) {
    const low = (text || "").replace(/־/g, "-");
    const intent = { raw: text, mode: "budget", budget: null, store_id: null, recipe_id: null,
                     adults: null, kids: null, holiday_id: null, must_tags: [], healthy_only: false, confidence: 0 };
    let hits = 0;
    let m = low.match(/(?:ב-?|תקציב\s*(?:של)?\s*|עד\s*)(\d{2,5})\s*(?:₪|ש"?ח|שקל|שקלים)?/) ||
            low.match(/(\d{2,5})\s*(?:₪|ש"?ח|שקל|שקלים)/);
    if (m) { intent.budget = +m[1]; hits++; }
    m = low.match(/ל-?\s*(\d{1,2})\s*(?:אנשים|סועדים|נפשות|חבר'?ה|איש)?/);
    if (m) { intent.adults = +m[1]; hits++; }
    m = low.match(/(\d{1,2})\s*ילדים/);
    if (m) { intent.kids = +m[1]; hits++; }
    Object.entries(DISH_WORDS).some(([id, words]) => words.some((w) => low.includes(w)) && (intent.recipe_id = id, intent.mode = "meal", hits++, true));
    Object.entries(STORE_WORDS).some(([id, words]) => words.some((w) => low.includes(w)) && (intent.store_id = id, hits++, true));
    Object.entries(HOLIDAY_WORDS).some(([id, words]) => words.some((w) => low.includes(w)) && (intent.holiday_id = id, hits++, true));
    intent.must_tags = Object.entries(ITEM_WORDS).filter(([, words]) => words.some((w) => low.includes(w))).map(([t]) => t);
    if (intent.must_tags.length) hits++;
    if (["בריא", "דל", "בלי סוכר", "דיאטה"].some((w) => low.includes(w))) { intent.healthy_only = true; hits++; }
    intent.confidence = Math.min(1, Math.round((hits / 4) * 100) / 100);
    return intent;
  }

  /* ---------------- receipt text -> cart ------------------------------------------ */
  const SKIP_WORDS = ['סה"כ', "סהכ", "סה״כ", "מזומן", "אשראי", "עודף", "כרטיס", "לתשלום", "חשבונית", "קופה", "תודה"];
  function similarity(a, b) {
    const sa = new Set(a.split("")), sb = new Set(b.split(""));
    const inter = [...sa].filter((c) => sb.has(c)).length;
    return inter / Math.max(sa.size, sb.size, 1);
  }
  function matchProduct(text, priceHint) {
    const clean = (text || "").replace(/[^֐-׿\w\s%]/g, " ").trim();
    if (!clean) return null;
    const tokens = clean.split(/\s+/).filter((t) => t.length > 1);
    let best = null, bestScore = 0;
    D.products.forEach((p) => {
      const overlap = tokens.filter((t) => p.name.includes(t) || p.brand.includes(t)).length;
      let score = overlap * 0.35 + similarity(clean, p.name) * 0.65;
      if (priceHint) {
        const closest = Math.min(...Object.values(p.prices).map((v) => Math.abs(priceHint - v)));
        score += Math.max(0, 0.25 - closest / 40);
      }
      if (score > bestScore) { best = p; bestScore = score; }
    });
    return bestScore >= 0.45 ? best : null;
  }
  function parseReceipt(text, storeId) {
    const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    let detected = storeId;
    Object.entries(STORE_WORDS).some(([id, words]) => words.some((w) => text.includes(w)) && (detected = detected || id, true));
    detected = detected || "shufersal";
    const items = [], unmatched = [];
    lines.forEach((line) => {
      if (SKIP_WORDS.some((w) => line.includes(w))) { unmatched.push(line); return; }
      const bc = line.match(/\b(\d{8,13})\b/);
      let product = null, qty = 1, priceHint = null;
      if (bc && byGtin[bc[1]]) product = byGtin[bc[1]];
      else {
        const m = line.match(/^(.*?)\s*(?:x\s*(\d{1,2}))?\s*(\d{1,4}[.,]\d{2})\s*$/);
        if (m) { qty = +(m[2] || 1); priceHint = parseFloat(m[3].replace(",", ".")); product = matchProduct(m[1], priceHint); }
        else product = matchProduct(line);
      }
      if (product) {
        const existing = items.find((i) => i.gtin === product.gtin);
        if (existing) {
          existing.qty += qty;
          const pr = price(product, detected, [], existing.qty);
          existing.line_total = pr.total; existing.saved = pr.saved;
        } else {
          items.push(toItem(product, detected, qty, [], { source: "receipt", note: `מהקבלה: ${line.slice(0, 40)}` }));
        }
      } else if (line.length > 3) unmatched.push(line);
    });
    const rows = compareStores(items.map((i) => ({ gtin: i.gtin, qty: i.qty })), [], false);
    return { store_id: detected, items, unmatched_lines: unmatched.slice(0, 8), comparison: rows,
             total: round2(items.reduce((s, i) => s + i.line_total, 0)),
             message_he: rows.length ? `את אותה קנייה אפשר לעשות היום ב${rows[0].store_name} ב-${rows[0].items_total.toFixed(2)} ₪` : null };
  }

  /* ---------------- recipe text -> cart ------------------------------------------- */
  const UNIT_G = { 'ק"ג': 1000, קילו: 1000, גרם: 1, 'מ"ל': 1, ליטר: 1000, כוס: 240, כוסות: 240,
                   כף: 15, כפות: 15, כפית: 5, כפיות: 5 };
  const COUNT_UNITS = ["יחידה", "יחידות", "חבילה", "חבילות", "שקית", "צרור"];
  const NOISE = ["אופן ההכנה", "הוראות", "מצרכים", "רכיבים", "בתיאבון"];
  function importRecipe(text, storeId, servings) {
    const items = [], unmatched = [], seen = new Set();
    (text || "").split("\n").forEach((raw) => {
      const line = raw.replace(/^[\s\-•*]+/, "").trim();
      if (line.length < 3 || NOISE.some((n) => line.includes(n))) return;
      const m = line.match(/^(\d+(?:[.,]\d+)?)?\s*([֐-׿"']{1,6})?\s*(.+)$/);
      if (!m) return;
      const qtyRaw = parseFloat((m[1] || "1").replace(",", "."));
      const unit = (m[2] || "").trim();
      const name = (UNIT_G[unit] || COUNT_UNITS.includes(unit) ? m[3] : `${unit} ${m[3]}`).trim();
      const product = matchProduct(name);
      if (!product || seen.has(product.gtin)) { if (!product) unmatched.push(line.slice(0, 40)); return; }
      let packs;
      if (UNIT_G[unit] && ["g", "ml"].includes(product.pack_unit)) {
        packs = Math.max(1, Math.ceil((qtyRaw * UNIT_G[unit] * (servings / 4)) / product.pack_size));
      } else if (COUNT_UNITS.includes(unit) && ["g", "ml"].includes(product.pack_unit) && product.pack_size >= 400) {
        packs = 1;
      } else {
        packs = Math.max(1, qtyRaw < 10 ? Math.round((qtyRaw * servings) / 4) : 1);
      }
      seen.add(product.gtin);
      items.push(toItem(product, storeId, packs, [], { source: "recipe_import", note: `מהמתכון: ${line.slice(0, 40)}` }));
    });
    return { items, unmatched_lines: unmatched.slice(0, 6), total: round2(items.reduce((s, i) => s + i.line_total, 0)) };
  }

  /* ---------------- leftovers ------------------------------------------------------ */
  function leftoverIdeas(gtins, limit) {
    const owned = new Set();
    gtins.forEach((g) => (byGtin[g] || { tags: [] }).tags.forEach((t) => owned.add(t)));
    return D.leftovers.map((idea) => {
      const have = idea.needs.filter((t) => owned.has(t));
      return Object.assign({}, idea, { coverage_pct: Math.round((have.length / idea.needs.length) * 100),
                                       missing: idea.needs.filter((t) => !owned.has(t)) });
    }).filter((i) => i.coverage_pct > 0)
      .sort((a, b) => b.coverage_pct - a.coverage_pct || a.time_min - b.time_min)
      .slice(0, limit || 3);
  }

  /* ---------------- WhatsApp export ------------------------------------------------ */
  function whatsappText(items, storeName, total, notes, budget) {
    const labels = { fresh: "🥬 טרי", protein: "🍗 בשר וחלבון", pantry: "🥫 יבש ומזווה",
                     snacks: "🍫 חטיפים ושתייה", extra: "🧻 נלווים" };
    const out = [`🛒 *רשימת קניות - ${storeName}*`, ""];
    Object.keys(labels).forEach((cat) => {
      const rows = items.filter((i) => i.category === cat);
      if (!rows.length) return;
      out.push(`*${labels[cat]}*`);
      rows.forEach((i) => out.push(`☐ ${i.name}${i.qty > 1 ? ` x${i.qty}` : ""} - ₪${i.line_total.toFixed(2)}${i.is_on_promo ? " 🏷️" : ""}`));
      out.push("");
    });
    out.push(`*סה"כ: ₪${total.toFixed(2)}*`);
    if (budget) out.push(`תקציב: ₪${budget} | נותרו: ₪${(budget - total).toFixed(2)}`);
    if (notes && notes.length) { out.push("", "*הערות למלקט:*"); notes.forEach((n) => out.push(`• ${n}`)); }
    out.push("", "נבנה עם CartFit 🧮");
    return out.join("\n");
  }

  function deepLink(gtin, storeId) {
    const p = byGtin[gtin], store = storeById[storeId];
    const term = encodeURIComponent(p ? p.name : gtin);
    const base = store.online_url || "";
    return `${base}${term}${base.includes("?") ? "&" : "?"}utm_source=cartfit&utm_medium=app&aff=cartfit`;
  }

  window.CartFit = { D, byGtin, storeById, byTag, LABELS, CATEGORY_WEIGHTS, round2, price, toItem,
    bestStoreFor, generateBasket, buildPayload, findSwap, compareStores, splitBasket, calculateMeal,
    parseIntent, parseReceipt, importRecipe, leftoverIdeas, whatsappText, deepLink };
})();
