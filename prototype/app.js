/* CartFit prototype UI — all six screens, driven by the ported engine. */
(function () {
  const CF = window.CartFit, D = CF.D;
  const view = document.getElementById("view");
  const tabsEl = document.getElementById("tabs");
  const subtitle = document.getElementById("subtitle");

  /* ------------------------------ state ------------------------------ */
  const DEFAULTS = {
    tab: "home", budget: 350, storeId: "shufersal", focus: "balanced", clubs: [], holidayId: null,
    healthyOnly: false, includeDelivery: false, isPro: false, seed: 1, items: [], basket: null,
    recipeId: "shawarma", adults: 4, kids: 2, sides: ["chips", "tahini", "salad", "pita"],
    pantryKeys: ["oil", "spice"], mealTab: "cart", meal: null, stepsDone: [],
    watch: [], pantry: [], savings: [], notes: "בשר טרי בלבד\nעגבניות קשות",
    shareCode: null, command: "", theme: null, lastScan: null, importText: "", importMode: "receipt",
  };
  let state = Object.assign({}, DEFAULTS);
  try {
    const raw = localStorage.getItem("cartfit-prototype");
    if (raw) state = Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (e) { /* private window — run from defaults */ }

  const save = () => { try { localStorage.setItem("cartfit-prototype", JSON.stringify(state)); } catch (e) {} };

  /* ------------------------------ helpers ---------------------------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ils = (n) => "₪" + (n || 0).toFixed(2);
  const ilsR = (n) => "₪" + Math.round(n || 0).toLocaleString("he-IL");
  const CAT_COLOR = { fresh: "var(--brand)", protein: "var(--accent)", pantry: "var(--indigo)",
                      snacks: "var(--pink)", extra: "var(--slate)" };
  const packLabel = (size, unit) =>
    unit === "g" ? (size >= 1000 ? size / 1000 + ' ק"ג' : size + " גרם")
    : unit === "ml" ? (size >= 1000 ? size / 1000 + " ליטר" : size + ' מ"ל')
    : unit === "unit" ? size + " יח'" : size + " " + unit;
  const total = () => CF.round2(state.items.reduce((s, i) => s + i.line_total, 0));
  const payload = () => CF.buildPayload(state.items, CF.storeById[state.storeId], state.budget,
                                        state.includeDelivery, state.basket ? state.basket.filler_suggestions : [], state.seed);

  function toast(msg) {
    state._toast = msg;
    render();
    setTimeout(() => { if (state._toast === msg) { state._toast = null; render(); } }, 3200);
  }

  /* ------------------------------ icons ------------------------------ */
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    cart: '<path d="M3 4h2l2.4 10.3a2 2 0 0 0 2 1.7h7.3a2 2 0 0 0 2-1.6L20 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
    chef: '<path d="M7 20h10v-6H7z"/><path d="M8 14a4 4 0 1 1 1.2-7.8 3.5 3.5 0 0 1 5.6 0A4 4 0 1 1 16 14"/>',
    scale: '<path d="M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z"/>',
    check: '<path d="M9 4h6v3H9zM6 7h12v13H6z"/><path d="m9 13 2 2 4-4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

  /* ------------------------------ tabs ------------------------------- */
  const TABS = [["home", "בית", "home"], ["cart", "הסל", "cart"], ["meal", "מצב שף", "chef"],
                ["compare", "השוואה", "scale"], ["checkout", "קנייה", "check"], ["insights", "תובנות", "chart"]];
  function renderTabs() {
    tabsEl.innerHTML = TABS.map(([id, label, icon]) =>
      `<button class="tab ${state.tab === id ? "on" : ""}" data-act="tab" data-arg="${id}">${svg(icon)}${label}</button>`).join("");
  }

  /* ------------------------------ shared bits ------------------------- */
  function itemCard(item, opts) {
    opts = opts || {};
    const watched = state.watch.includes(item.gtin);
    const tags = [];
    if (item.is_on_promo) tags.push(`<span class="tag tag-promo">🏷️ ${esc(item.promo_description)}${item.is_club_promo ? " · מועדון" : ""}</span>`);
    if (item.bundle_description) tags.push(`<span class="tag tag-bundle">מארז ${esc(item.bundle_description)}</span>`);
    if (item.is_sponsored) tags.push('<span class="tag tag-soft">ממומן</span>');
    (item.warning_labels || []).forEach((w) => tags.push(`<span class="tag tag-warn">${esc(w.label_he)}</span>`));

    const controls = opts.compact ? "" : `
      <div class="row" style="margin-top:8px;gap:6px">
        <span class="qty">
          <button data-act="qty" data-arg="${item.gtin}" data-n="-1" aria-label="הפחת">−</button>
          <b class="num small">${item.qty}</b>
          <button data-act="qty" data-arg="${item.gtin}" data-n="1" aria-label="הוסף">+</button>
        </span>
        <button class="iconbtn ${item.locked ? "on" : ""}" data-act="lock" data-arg="${item.gtin}">${item.locked ? "🔒 נעול" : "🔓 נעל"}</button>
        <button class="iconbtn" data-act="swap" data-arg="${item.gtin}">🔄 החלף</button>
        <button class="iconbtn ${watched ? "on" : ""}" data-act="watch" data-arg="${item.gtin}">${watched ? "★" : "☆"} מעקב</button>
        <button class="iconbtn" data-act="policy" data-arg="${item.gtin}">אם חסר: ${esc(POLICY[item.substitute_policy || "brand_alternative"])}</button>
        <button class="iconbtn" data-act="remove" data-arg="${item.gtin}" style="margin-inline-start:auto">✕</button>
      </div>`;

    const policyPanel = state._policyFor === item.gtin ? `
      <div class="row" style="margin-top:8px;background:var(--surface-2);padding:8px;border-radius:12px">
        ${Object.keys(POLICY).map((p) => `<button class="chip ${(item.substitute_policy || "brand_alternative") === p ? "on" : ""}"
          data-act="setpolicy" data-arg="${item.gtin}" data-n="${p}">${esc(POLICY[p])}</button>`).join("")}
      </div>` : "";

    return `<div class="item ${item.locked ? "locked" : ""}">
      <span class="catbar" style="background:${CAT_COLOR[item.category]}"></span>
      <div class="item-main">
        <div class="spread">
          <div style="min-width:0">
            <div class="item-name">${esc(item.name)}</div>
            <div class="tiny muted">${esc(item.brand)} · ${packLabel(item.pack_size, item.pack_unit)}${item.qty > 1 ? " · " + item.qty + " יח'" : ""}</div>
          </div>
          <div style="text-align:left;flex:0 0 auto">
            <div class="num" style="font-weight:700">${ils(item.line_total)}</div>
            ${item.saved > 0 ? `<div class="tiny muted" style="text-decoration:line-through">${ils(item.list_price * item.qty)}</div>` : ""}
          </div>
        </div>
        ${tags.length ? `<div class="row" style="gap:4px;margin-top:6px">${tags.join("")}</div>` : ""}
        ${item.bundle_hint ? `<div class="banner tag-bundle tiny" style="margin-top:6px">💡 ${esc(item.bundle_hint)}</div>` : ""}
        ${item.note ? `<div class="tiny muted" style="margin-top:4px">${esc(item.note)}</div>` : ""}
        ${controls}${policyPanel}
      </div>
    </div>`;
  }
  const POLICY = { brand_alternative: "מותג חלופי", size_upgrade: "גודל גדול יותר", do_not_replace: "לא להחליף" };

  function donut(rows, sum, title) {
    if (!rows.length) return "";
    const R = 54, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = rows.map((d) => {
      const len = (d.pct / 100) * C;
      const el = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${CAT_COLOR[d.category] || "var(--slate)"}"
        stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"></circle>`;
      off += len; return el;
    }).join("");
    return `<div class="card pad">
      <h3 style="font-size:15px;margin-bottom:10px">${esc(title)}</h3>
      <div class="row" style="flex-wrap:nowrap;gap:14px;align-items:center">
        <svg viewBox="0 0 140 140" style="width:124px;height:124px;flex:0 0 124px;transform:rotate(-90deg)">
          <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="18"></circle>${arcs}
        </svg>
        <div style="min-width:0;flex:1" class="stack" >
          ${rows.map((d) => `<div class="spread small" style="gap:6px">
            <span class="row" style="gap:6px;flex-wrap:nowrap;min-width:0">
              <span style="width:10px;height:10px;border-radius:3px;background:${CAT_COLOR[d.category] || "var(--slate)"};flex:0 0 10px"></span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.label_he)}</span></span>
            <span class="muted num tiny">${d.pct}% · ${ils(d.total)}</span></div>`).join("")}
          <div class="hr"></div>
          <div class="spread small"><b>סה"כ</b><b class="num">${ils(sum)}</b></div>
        </div>
      </div></div>`;
  }

  /* ------------------------------ screens ---------------------------- */
  function homeView() {
    const store = CF.storeById[state.storeId];
    const pct = ((state.budget - 50) / 1450) * 100;
    const belowMin = state.budget < store.min_online_order;
    return `
    <div class="card pad">
      <div class="spread"><span class="small muted">תקציב יעד</span><span class="tiny muted">₪50 – ₪1,500</span></div>
      <div class="row" style="align-items:flex-end;gap:6px;margin:6px 0 2px">
        <span class="bignum">${ilsR(state.budget)}</span><span class="small muted" style="padding-bottom:6px">לסל אחד</span>
      </div>
      <input class="slider" type="range" min="50" max="1500" step="10" value="${state.budget}" id="budgetRange"
        style="background:linear-gradient(to left, var(--brand) ${pct}%, var(--line) ${pct}%)" aria-label="תקציב">
      <div class="row" style="margin-top:12px">
        ${[150, 300, 500, 800].map((q) => `<button class="chip ${state.budget === q ? "on" : ""}" data-act="budget" data-arg="${q}">${ilsR(q)}</button>`).join("")}
      </div>
    </div>

    <div class="card pad">
      <div class="spread" style="margin-bottom:10px"><b class="small">רשת</b><span class="tiny muted">מחירים מקבצי חוק המזון</span></div>
      <div class="scroll-x">
        ${D.stores.map((s) => `<button class="storecard ${s.id === state.storeId ? "on" : ""}" data-act="store" data-arg="${s.id}">
          <span class="row" style="gap:7px;flex-wrap:nowrap"><span class="logo" style="background:${s.color}">${esc(s.short.slice(0, 2))}</span>
          <b style="font-size:13.5px">${esc(s.short)}</b></span>
          <span class="tiny muted">משלוח ${ilsR(s.delivery_fee)}</span>
          <span class="tiny muted">מינימום ${ilsR(s.min_online_order)}</span></button>`).join("")}
      </div>
      ${belowMin ? `<div class="banner banner-accent" style="margin-top:10px">מינימום להזמנה ב${esc(store.name)} הוא ${ilsR(store.min_online_order)} - בתקציב הזה עדיף איסוף עצמי או קנייה בסניף.</div>` : ""}
    </div>

    <div class="card pad">
      <b class="small">מצב חג ואירוע</b>
      <p class="note" style="margin:2px 0 10px">הסל מותאם אוטומטית לתפריט ולמוצרים של האירוע</p>
      <div class="scroll-x">
        <button class="chip ${!state.holidayId ? "on" : ""}" data-act="holiday" data-arg="">רגיל</button>
        ${D.holidays.map((h) => `<button class="chip ${state.holidayId === h.id ? "on" : ""}" data-act="holiday" data-arg="${h.id}">${h.emoji} ${esc(h.title)}</button>`).join("")}
      </div>
      ${state.holidayId ? `<div class="banner banner-brand" style="margin-top:10px">${esc((D.holidays.find((h) => h.id === state.holidayId) || {}).note)}</div>` : ""}
    </div>

    <div class="card pad stack">
      <b class="small">סוג הסל</b>
      <div class="row">
        ${[["balanced", "מאוזן"], ["pantry", "מילוי מזווה"], ["weekend", "סוף שבוע"]].map(([id, label]) =>
          `<button class="chip ${state.focus === id ? "on" : ""}" data-act="focus" data-arg="${id}">${label}</button>`).join("")}
      </div>
      <div class="hr"></div>
      <div class="spread"><span class="small">🥗 סל בריא (בלי סימוני אזהרה)</span>
        <button class="switch ${state.healthyOnly ? "on" : ""}" data-act="toggle" data-arg="healthyOnly" aria-label="סל בריא"></button></div>
      <div class="spread"><span class="small">🚚 כלול דמי משלוח בתקציב</span>
        <button class="switch ${state.includeDelivery ? "on" : ""}" data-act="toggle" data-arg="includeDelivery" aria-label="דמי משלוח"></button></div>
    </div>

    <div class="card pad">
      <b class="small">מועדוני לקוחות שלי</b>
      <div class="row" style="margin-top:8px">
        ${D.clubs.map((c) => `<button class="chip ${state.clubs.includes(c.id) ? "on" : ""}" data-act="club" data-arg="${c.id}">${esc(c.name)}</button>`).join("")}
      </div>
      <p class="note" style="margin-top:8px">הנחות מועדון (ClubDiscount) משוקללות רק למי שזכאי להן</p>
    </div>

    <div class="card pad">
      <b class="small">🎙️ בנה סל בפקודה חופשית</b>
      <p class="note" style="margin:2px 0 8px">באפליקציה זה מיקרופון (Web Speech בעברית). כאן אפשר להקליד את אותו המשפט.</p>
      <input type="text" id="cmdBox" value="${esc(state.command)}" placeholder="תרכיב לי סל לשישי ב-400 שקל כולל עוף, חלות ושתייה">
      <div class="row" style="margin-top:8px">
        <button class="chip" data-act="cmdfill" data-arg="תרכיב לי סל לשישי ב-400 שקל כולל עוף, חלות ושתייה">סל שישי ₪400</button>
        <button class="chip" data-act="cmdfill" data-arg="ערב המבורגר ל-5 חבר'ה עם צ'יפס וקולה">המבורגר ל-5</button>
        <button class="chip" data-act="cmdfill" data-arg="סל בריא ברמי לוי ב-250 שקל">סל בריא ₪250</button>
      </div>
      <button class="btn btn-ghost btn-full" style="margin-top:8px" data-act="runcmd">נתח את הפקודה</button>
      ${state._intent ? `<div class="banner banner-brand" style="margin-top:8px">${esc(state._intent)}</div>` : ""}
    </div>

    <button class="btn btn-primary btn-full" data-act="build">✨ בנה לי סל ב-${ilsR(state.budget)}</button>`;
  }

  function cartView() {
    if (!state.items.length) {
      return `<div class="card pad" style="text-align:center">
        <p style="font-weight:700">הסל ריק</p>
        <p class="small muted">בנה סל לפי תקציב או הרכב ארוחה במצב שף</p>
        <button class="btn btn-primary" style="margin-top:10px" data-act="tab" data-arg="home">לבניית סל</button></div>`;
    }
    const p = payload();
    const t = p.items_total + (state.includeDelivery ? p.delivery.delivery_fee : 0);
    const remaining = CF.round2(state.budget - t);
    const pct = Math.min(100, Math.round((t / state.budget) * 100));
    const scan = state.lastScan;

    return `
    <div class="card pad" style="position:sticky;top:calc(env(safe-area-inset-top,0px) + 66px);z-index:10">
      <div class="spread small"><span>נוצל: <b class="num" style="font-size:17px">${ilsR(t)}</b> / ${ilsR(state.budget)}</span>
        <span class="num" style="color:${remaining < 0 ? "var(--danger)" : "var(--brand-deep)"}">
          ${remaining < 0 ? "חריגה " + ilsR(Math.abs(remaining)) : "נותרו " + ilsR(remaining)}</span></div>
      <div class="progress" style="margin-top:8px"><div style="width:${pct}%;background:${remaining < 0 ? "var(--danger)" : "var(--brand)"}"></div></div>
      <div class="row" style="margin-top:10px;flex-wrap:nowrap">
        <button class="chip" style="flex:1;justify-content:center" data-act="shuffle">🔀 ערבב מחדש</button>
        <button class="chip ${state._scanOpen ? "on" : ""}" style="flex:1;justify-content:center" data-act="scanopen">📷 סרוק מוצר</button>
        <button class="chip" style="flex:1;justify-content:center" data-act="share">🔗 שתף סל</button>
      </div>
      ${state.shareCode ? `<p class="note" style="margin-top:6px">קוד סל משותף: <code>${esc(state.shareCode)}</code> · <code>/cart?share=${esc(state.shareCode)}</code></p>` : ""}
    </div>

    ${state._toast ? `<div class="banner banner-brand">${esc(state._toast)}</div>` : ""}
    ${p.message_he ? `<div class="banner ${p.delivery.meets_minimum ? "banner-accent" : "banner-danger"}">${esc(p.message_he)}</div>` : ""}

    ${state._scanOpen ? `
    <div class="card pad">
      <b class="small">📷 סריקת ברקוד בסניף</b>
      <p class="note" style="margin:2px 0 8px">באפליקציה המצלמה סורקת EAN-13 (BarcodeDetector). כאן בוחרים ברקוד מהקטלוג או מקלידים אותו.</p>
      <input type="text" id="scanBox" placeholder="הקלד ברקוד (13 ספרות)">
      <div class="row" style="margin-top:8px">
        ${[0, 31, 57, 80].map((i) => D.products[i]).map((pr) => `<button class="chip" data-act="scan" data-arg="${pr.gtin}">${esc(pr.name.split(" ").slice(0, 2).join(" "))}</button>`).join("")}
        <button class="chip" data-act="scaninput">בדוק ברקוד שהוקלד</button>
      </div>
      ${scan ? (scan.found ? `
        <div class="hr" style="margin:12px 0"></div>
        <b class="small">${esc(scan.product.name)}</b>
        <div class="stack" style="gap:4px;margin-top:6px">
          ${scan.prices.map((r) => `<div class="spread small"><span style="${r.is_best ? "color:var(--brand-deep);font-weight:700" : ""}">${esc(r.store_name)}</span>
            <span class="num">${ils(r.items_total)}</span></div>`).join("")}
        </div>
        ${scan.cheaper ? `<div class="banner banner-accent" style="margin-top:8px">${esc(scan.cheaper)}</div>` : ""}
        <div class="banner ${scan.fits ? "banner-brand" : "banner-danger"}" style="margin-top:6px">${esc(scan.budgetMsg)}</div>
        <button class="btn btn-primary btn-full" style="margin-top:8px" data-act="addscan" data-arg="${scan.product.gtin}">הוסף לסל</button>`
        : `<div class="banner banner-danger" style="margin-top:10px">הברקוד לא נמצא בקטלוג</div>`) : ""}
    </div>` : ""}

    <div class="stack">${state.items.map((i) => itemCard(i)).join("")}</div>

    ${p.filler_suggestions && p.filler_suggestions.length && remaining >= 1 ? `
    <div class="card pad">
      <b class="small">סגירת תקציב</b>
      <div class="row" style="margin-top:8px">
        ${p.filler_suggestions.map((f) => `<button class="chip" data-act="addsugg" data-arg="${f.gtin}">+ ${esc(f.name.split(" ").slice(0, 3).join(" "))} · ${ils(f.line_total)}</button>`).join("")}
      </div></div>` : ""}

    ${donut(p.breakdown, p.items_total, "התפלגות הסל")}

    <div class="card pad">
      <div class="row" style="margin-bottom:8px">
        <button class="chip ${state.importMode === "receipt" ? "on" : ""}" data-act="importmode" data-arg="receipt">🧾 קבלה ישנה</button>
        <button class="chip ${state.importMode === "recipe" ? "on" : ""}" data-act="importmode" data-arg="recipe">🔗 מתכון חופשי</button>
      </div>
      <textarea id="importBox" rows="4" placeholder="${state.importMode === "receipt"
        ? "הדבק את טקסט הקבלה (תוצאת OCR מהצילום)" : "הדבק את רשימת המצרכים מהמתכון"}">${esc(state.importText)}</textarea>
      <div class="row" style="margin-top:8px">
        <button class="chip" data-act="demoimport">מלא דוגמה</button>
        <button class="btn btn-ghost" style="flex:1" data-act="runimport">${state.importMode === "receipt" ? "המר לסל" : "הכנס לסל"}</button>
      </div>
      ${state._importMsg ? `<div class="banner banner-brand" style="margin-top:8px">${esc(state._importMsg)}</div>` : ""}
    </div>

    <div class="grid2">
      <button class="btn btn-ghost" data-act="tab" data-arg="compare">⚖️ השווה רשתות</button>
      <button class="btn btn-primary" data-act="tab" data-arg="checkout">✓ לרשימת הקנייה</button>
    </div>`;
  }

  function mealView() {
    const meal = state.meal;
    const counter = (label, value, key, min) => `<div class="spread" style="border:1px solid var(--line);border-radius:12px;padding:8px 12px">
      <span class="small">${label}</span>
      <span class="row" style="gap:10px;flex-wrap:nowrap">
        <button class="iconbtn" data-act="diners" data-arg="${key}" data-n="-1" ${value <= min ? "disabled" : ""}>−</button>
        <b class="num" style="font-size:17px;min-width:18px;text-align:center">${value}</b>
        <button class="iconbtn" data-act="diners" data-arg="${key}" data-n="1">+</button></span></div>`;

    const head = `
    <div class="card pad stack">
      <b class="small">כמה סועדים?</b>
      ${counter("מבוגרים", state.adults, "adults", 1)}
      ${counter("ילדים (נספרים כ-0.6 מנה)", state.kids, "kids", 0)}
      <p class="note">סה"כ מנות: <b class="num">${(state.adults + state.kids * 0.6).toFixed(1)}</b></p>
    </div>
    <div class="card pad">
      <b class="small">המנה המרכזית</b>
      <div class="grid2" style="margin-top:8px">
        ${D.recipes.map((r) => `<button class="storecard ${state.recipeId === r.id ? "on" : ""}" style="min-width:0" data-act="recipe" data-arg="${r.id}">
          <span class="row" style="gap:8px;flex-wrap:nowrap"><span style="font-size:22px">${r.emoji}</span>
          <span><b style="font-size:13.5px">${esc(r.title)}</b><br><span class="tiny muted">${r.steps.reduce((s, x) => s + x.duration_min, 0)} דק' · ${r.steps.length} שלבים</span></span></span>
        </button>`).join("")}
      </div>
    </div>
    <div class="card pad">
      <b class="small">תוספות</b>
      <div class="row" style="margin-top:8px">
        ${D.sides.map((s) => `<button class="chip ${state.sides.includes(s.id) ? "on" : ""}" data-act="side" data-arg="${s.id}">${s.emoji} ${esc(s.title)}</button>`).join("")}
      </div>
    </div>
    <div class="card pad">
      <b class="small">יש לי בבית (לא להוסיף לסל)</b>
      <div class="row" style="margin-top:8px">
        ${[["oil", "שמן"], ["spice", "תבלינים"], ["paprika", "פפריקה"], ["ketchup", "קטשופ"],
           ["charcoal", "פחמים"], ["foil", "אלומיניום"], ["plates", "חד פעמי"]].map(([k, label]) =>
          `<button class="chip ${state.pantryKeys.includes(k) ? "on" : ""}" data-act="pantrykey" data-arg="${k}">${label}</button>`).join("")}
      </div>
    </div>`;

    if (!meal) return head;

    const nutri = meal.nutrition_per_serving;
    const summary = `
    <div class="card" style="overflow:hidden">
      <div class="hero hero-amber">
        <div class="small">${meal.emoji} ${esc(meal.title)} · ${meal.servings} מנות</div>
        <div class="bignum" style="margin:4px 0">${ilsR(meal.total)}</div>
        <div class="small">רק ${ils(meal.per_serving)} לסועד · חיסכון של ${meal.saving_pct}% מהזמנת משלוח (${ilsR(meal.delivery_total)})</div>
      </div>
      <div class="row" style="flex-wrap:nowrap;text-align:center;padding:4px 0">
        ${[["קלוריות", nutri.calories], ["חלבון", nutri.protein_g + " ג'"], ["פחמימות", nutri.carbs_g + " ג'"], ["שומן", nutri.fat_g + " ג'"]]
          .map(([l, v]) => `<div style="flex:1;padding:8px 2px"><div class="tiny muted">${l}</div><div class="num" style="font-weight:700">${v}</div></div>`).join("")}
      </div>
      <p class="tiny muted" style="text-align:center;border-top:1px solid var(--line);padding:6px;margin:0">לכל סועד</p>
    </div>

    <div class="row" style="flex-wrap:nowrap">
      <button class="chip ${state.mealTab === "cart" ? "on" : ""}" style="flex:1;justify-content:center" data-act="mealtab" data-arg="cart">🛒 מצרכים בסל</button>
      <button class="chip ${state.mealTab === "guide" ? "on" : ""}" style="flex:1;justify-content:center" data-act="mealtab" data-arg="guide">👨‍🍳 מדריך הכנה</button>
    </div>`;

    const body = state.mealTab === "cart" ? `
      ${meal.excluded_pantry.length ? `<div class="banner tag-soft">לא נוספו לסל (יש לך בבית): ${esc(meal.excluded_pantry.join(" · "))}</div>` : ""}
      <div class="card pad stack" style="gap:6px">
        <b class="small">כמויות מדויקות</b>
        ${meal.quantities.map((q) => `<div class="spread tiny" style="gap:8px">
          <span>${esc(q.label)}</span>
          <span class="muted num">${q.needed}${q.unit === "unit" ? " יח'" : q.unit} → ${q.packs} × ${esc(q.product)}</span></div>`).join("")}
      </div>
      <div class="stack">${meal.items.map((i) => itemCard(i, { compact: true })).join("")}</div>
      <button class="btn btn-primary btn-full" data-act="mealtocart">העבר את הארוחה לסל</button>`
    : `
      <div class="card pad spread"><span class="small">זמן הכנה כולל: <b>${meal.total_time_min} דקות</b></span>
        <span class="small muted">${state.stepsDone.length}/${meal.steps.length} שלבים</span></div>
      <div class="stack">
        ${meal.steps.map((s) => {
          const done = state.stepsDone.includes(s.order);
          return `<div class="card pad" style="${done ? "opacity:.6" : ""}">
            <div class="steps-line">
              <button class="stepnum ${done ? "done" : ""}" data-act="step" data-arg="${s.order}">${done ? "✓" : s.order}</button>
              <div style="min-width:0;flex:1">
                <div class="spread"><b style="font-size:14px;${done ? "text-decoration:line-through" : ""}">${esc(s.title)}</b>
                  <span class="tiny muted">⏱ ${s.duration_min} דק'</span></div>
                <p class="small" style="margin:4px 0 0;color:var(--ink-soft)">${esc(s.desc)}</p>
                ${s.tip ? `<p class="banner banner-accent tiny" style="margin-top:8px">💡 ${esc(s.tip)}</p>` : ""}
              </div></div></div>`;
        }).join("")}
      </div>`;

    return head + summary + body;
  }

  function compareView() {
    if (!state.items.length) return `<div class="card pad" style="text-align:center"><p style="font-weight:700">אין מה להשוות עדיין</p>
      <button class="btn btn-primary" style="margin-top:10px" data-act="tab" data-arg="home">בנה סל</button></div>`;
    const items = state.items.map((i) => ({ gtin: i.gtin, qty: i.qty }));
    const rows = CF.compareStores(items, state.clubs, true);
    const max = Math.max.apply(null, rows.map((r) => r.grand_total));
    const sp = CF.splitBasket(items, state.clubs);

    return `
    <div class="card hero hero-green">
      <div class="small">אפשר לחסוך עד</div>
      <div class="bignum" style="margin:4px 0">${ilsR(rows[rows.length - 1].grand_total - rows[0].grand_total)}</div>
      <div class="small">הכי זול: ${esc(rows[0].store_name)} (${ils(rows[0].grand_total)}) · הכי יקר: ${ils(rows[rows.length - 1].grand_total)}</div>
    </div>

    <div class="stack">
      ${rows.map((r) => `<button class="card pad" style="text-align:right;${r.is_best ? "border-color:var(--brand)" : ""}" data-act="store" data-arg="${r.store_id}">
        <div class="spread">
          <span class="row" style="gap:8px;flex-wrap:nowrap"><span class="logo" style="background:${r.color}">${esc(r.store_name.slice(0, 2))}</span>
            <b style="font-size:14px">${esc(r.store_name)}</b>${r.is_best ? '<span class="tag tag-brand">👑 הכי זול</span>' : ""}
            ${state.storeId === r.store_id ? '<span class="tag tag-soft">נבחר</span>' : ""}</span>
          <span style="text-align:left"><b class="num">${ils(r.grand_total)}</b>
            ${r.diff_from_best > 0 ? `<br><span class="tiny num" style="color:var(--danger)">+${ils(r.diff_from_best)}</span>` : ""}</span>
        </div>
        <div class="progress" style="margin-top:8px"><div style="width:${Math.round((r.grand_total / max) * 100)}%;background:${r.is_best ? "var(--brand)" : "var(--line)"}"></div></div>
        <div class="row tiny muted" style="margin-top:6px;gap:10px">
          <span class="num">מוצרים ${ils(r.items_total)}</span><span class="num">משלוח ${ils(r.delivery_fee)}</span>
          ${r.promo_savings > 0 ? `<span style="color:var(--brand-deep)" class="num">מבצעים ${ils(r.promo_savings)}-</span>` : ""}
          ${!r.meets_minimum ? '<span style="color:var(--accent)">מתחת למינימום הזמנה</span>' : ""}
        </div></button>`).join("")}
    </div>

    <div class="card pad">
      <div class="spread"><b class="small">🔀 סל מפוצל בין שתי רשתות</b>
        ${state.isPro ? '<span class="tag tag-brand">Pro פעיל</span>' : '<span class="tag tag-promo">👑 Pro</span>'}</div>
      ${state.isPro ? (sp.split ? `
        <div class="banner banner-brand" style="margin-top:8px">${esc(sp.message_he)}</div>
        ${sp.split.map((g) => `<div class="card pad" style="margin-top:8px;box-shadow:none;background:var(--surface-2)">
          <div class="spread"><b class="small">${esc(g.store_name)} ${g.pickup ? '<span class="tag tag-soft">איסוף עצמי</span>' : '<span class="tag tag-soft">משלוח ' + ilsR(g.delivery_fee) + "</span>"}</b>
            <b class="num small">${ils(g.items_total)}</b></div>
          <p class="tiny muted" style="margin:6px 0 0">${esc(g.items.slice(0, 7).map((i) => i.name.split(" ").slice(0, 2).join(" ")).join(" · "))}${g.items.length > 7 ? " ועוד " + (g.items.length - 7) : ""}</p>
        </div>`).join("")}
        <div class="spread" style="margin-top:10px"><b class="small">סה"כ מפוצל</b><b class="num">${ils(sp.split_total)}</b></div>`
        : `<p class="small muted" style="margin-top:8px">${esc(sp.message_he)}</p>`)
      : `<div style="text-align:center;background:var(--surface-2);border-radius:14px;padding:14px;margin-top:8px">
          <p class="small" style="margin:0">CartFit Pro מחשב את הפיצול האופטימלי בין שתי רשתות (כולל איסוף עצמי) וחוסך עוד עשרות שקלים בחודש</p>
          <button class="btn btn-primary" style="margin-top:10px" data-act="pro">נסה Pro ב-₪9.90 לחודש</button></div>`}
    </div>

    <button class="btn btn-primary btn-full" data-act="tab" data-arg="checkout">המשך לרשימת הקנייה</button>`;
  }

  function checkoutView() {
    if (!state.items.length) return `<div class="card pad" style="text-align:center"><p style="font-weight:700">אין רשימה עדיין</p>
      <button class="btn btn-primary" style="margin-top:10px" data-act="tab" data-arg="home">בנה סל</button></div>`;
    const t = total();
    const checked = state.items.filter((i) => i.checked).length;
    const store = CF.storeById[state.storeId];
    const notes = state.notes.split("\n").filter(Boolean);
    const waText = CF.whatsappText(state.items, store.name, t, notes, state.budget);
    const done = state._checkoutDone;

    return `
    <div class="card pad spread">
      <div><b>רשימת קנייה · ${esc(store.name)}</b>
        <div class="tiny muted">${state.items.length} פריטים · ${ilsR(t)} · סומנו ${checked}/${state.items.length}</div></div>
      <button class="chip" data-act="clearchecks">נקה סימונים</button>
    </div>
    <div class="banner banner-brand">📴 הרשימה נשמרת במכשיר (localStorage) וממשיכה לעבוד גם בלי קליטה בסניף</div>

    <div class="stack" style="gap:6px">
      ${state.items.map((i) => `<button class="checkline ${i.checked ? "done" : ""}" data-act="check" data-arg="${i.gtin}">
        <span class="box ${i.checked ? "on" : ""}">${i.checked ? "✓" : ""}</span>
        <span style="min-width:0;flex:1"><span class="item-name">${esc(i.name)}${i.qty > 1 ? " × " + i.qty : ""}</span>
          <span class="tiny muted" style="display:block">אם חסר: ${esc(POLICY[i.substitute_policy || "brand_alternative"])}</span></span>
        <b class="num small">${ils(i.line_total)}</b></button>`).join("")}
    </div>

    <div class="card pad">
      <b class="small">הערות למלקט</b>
      <textarea id="notesBox" rows="3" style="margin-top:8px">${esc(state.notes)}</textarea>
    </div>

    <div class="card pad">
      <b class="small">📲 ייצוא לוואטסאפ</b>
      <pre style="white-space:pre-wrap;font-family:var(--body);font-size:12px;background:var(--surface-2);
        border-radius:12px;padding:10px;max-height:190px;overflow:auto;margin:8px 0">${esc(waText)}</pre>
      <div class="row">
        <button class="btn btn-primary" style="flex:1" data-act="copywa">העתק רשימה</button>
        <a class="btn btn-ghost" style="flex:1" target="_blank" rel="noreferrer"
           href="https://wa.me/?text=${encodeURIComponent(waText)}">פתח בוואטסאפ</a>
      </div>
    </div>

    <div class="card pad">
      <b class="small">🔗 קישורים ישירים לאתר ${esc(store.name)}</b>
      <p class="note" style="margin:2px 0 8px">עם תוסף הכרום כל הסל נטען לעגלה בלחיצה אחת</p>
      <div class="stack" style="gap:2px;max-height:170px;overflow:auto">
        ${state.items.slice(0, 12).map((i) => `<a class="small" style="color:var(--brand-deep);text-decoration:none;padding:3px 0"
          href="${esc(CF.deepLink(i.gtin, state.storeId))}" target="_blank" rel="noreferrer">${esc(i.name)}${i.qty > 1 ? " × " + i.qty : ""}</a>`).join("")}
      </div>
    </div>

    <button class="btn btn-ghost btn-full" data-act="finish">✓ סיימתי לקנות - עדכן חיסכון ומזווה</button>

    ${done ? `
      <div class="banner banner-brand">${esc(done.headline)}</div>
      <div class="card pad">
        <b class="small">🍳 מה מכינים ממה שנשאר</b>
        <div class="stack" style="gap:8px;margin-top:8px">
          ${done.ideas.map((i) => `<div style="background:var(--surface-2);border-radius:12px;padding:10px">
            <b class="small">${esc(i.title)} · ${i.time_min} דק'</b>
            <p class="tiny muted" style="margin:2px 0 0">${esc(i.desc)}</p></div>`).join("")}
        </div>
      </div>
      <button class="btn btn-primary btn-full" data-act="tab" data-arg="insights">לדשבורד החיסכון</button>` : ""}`;
  }

  function insightsView() {
    const month = new Date().toISOString().slice(0, 7);
    const entries = state.savings.filter((e) => e.date.startsWith(month));
    const promoSaved = CF.round2(entries.reduce((s, e) => s + e.promo_saved, 0));
    const switchSaved = CF.round2(entries.reduce((s, e) => s + Math.max(0, e.worst_total - e.items_total), 0));
    const totalSaved = CF.round2(promoSaved + switchSaved);
    const inflation = state.savings.length >= 2
      ? CF.round2(((state.savings[state.savings.length - 1].items_total - state.savings[0].items_total) / state.savings[0].items_total) * 100)
      : null;

    const catTotals = {};
    state.savings.forEach((e) => Object.entries(e.by_category || {}).forEach(([c, v]) => (catTotals[c] = (catTotals[c] || 0) + v)));
    const sum = Object.values(catTotals).reduce((a, b) => a + b, 0);
    const catRows = Object.entries(catTotals).map(([c, v]) => ({ category: c, label_he: CF.LABELS[c],
      total: CF.round2(v), pct: sum ? CF.round2((v / sum) * 100) : 0 })).sort((a, b) => b.total - a.total);

    const watchRows = state.watch.map((g) => {
      const p = CF.byGtin[g]; if (!p) return null;
      const best = CF.bestStoreFor(p, state.clubs);
      const ref = Math.max.apply(null, Object.values(p.prices));
      const pr = CF.price(p, best.store_id, state.clubs, 1);
      return { gtin: g, name: p.name, store: CF.storeById[best.store_id].name, price: best.price,
               drop: Math.round(((ref - best.price) / ref) * 100), promo: !!pr.promo,
               desc: pr.promo ? pr.promo.description : null };
    }).filter(Boolean);
    const alerts = watchRows.filter((w) => w.drop >= 8 || w.promo);

    const today = new Date();
    const pantryRows = state.pantry.map((e) => {
      const p = CF.byGtin[e.gtin]; if (!p) return null;
      const days = Math.round((new Date(e.expires) - today) / 86400000);
      return { name: p.name, qty: e.qty, days };
    }).filter(Boolean).sort((a, b) => a.days - b.days);
    const ideas = CF.leftoverIdeas(state.pantry.map((e) => e.gtin), 3);

    return `
    <div class="card" style="overflow:hidden">
      <div class="hero hero-green">
        <div class="small">🐖 החיסכון שלך החודש</div>
        <div class="bignum" style="margin:4px 0">${ilsR(totalSaved)}</div>
        <div class="small">${totalSaved ? "בזכות בחירת הרשת הזולה ומיצוי מבצעים" : "סיים קנייה אחת כדי להתחיל לעקוב"}</div>
      </div>
      <div class="row" style="flex-wrap:nowrap;text-align:center">
        ${[["ממבצעים", ils(promoSaved)], ["מבחירת רשת", ils(switchSaved)], ["סלים", entries.length]]
          .map(([l, v]) => `<div style="flex:1;padding:10px 2px"><div class="tiny muted">${l}</div><div class="num" style="font-weight:700">${v}</div></div>`).join("")}
      </div>
      ${inflation !== null ? `<div class="small" style="border-top:1px solid var(--line);padding:10px">
        מדד האינפלציה האישי שלך: <b class="num" style="color:${inflation >= 0 ? "var(--danger)" : "var(--brand-deep)"}">${inflation > 0 ? "+" : ""}${inflation}%</b> בסל הקבוע שלך</div>` : ""}
    </div>

    ${catRows.length ? donut(catRows, CF.round2(sum), "הוצאות לפי קטגוריה") : ""}

    <div class="card pad">
      <div class="spread"><b class="small">★ מעקב מחירים</b>
        ${state.isPro ? '<span class="tag tag-brand">ללא הגבלה</span>' : '<span class="tag tag-soft">עד 3 מוצרים בחינם</span>'}</div>
      ${alerts.length ? `<div class="stack" style="gap:6px;margin:8px 0">
        ${alerts.map((a) => `<div class="banner banner-accent tiny">🔔 <b>ירידת מחיר: ${esc(a.name)}</b> · עכשיו ${ils(a.price)} ב${esc(a.store)}${a.drop > 0 ? ` (${a.drop}% פחות)` : ""}</div>`).join("")}
      </div>` : ""}
      ${watchRows.length ? watchRows.map((w) => `<div class="spread small" style="border-top:1px solid var(--line);padding:7px 0">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.name)}</span>
        <span class="num tiny"><b>${ils(w.price)}</b> · ${esc(w.store)}${w.drop > 0 ? ` <span style="color:var(--brand-deep)">${w.drop}%-</span>` : ""}</span></div>`).join("")
        : '<p class="small muted" style="margin-top:8px">סמן מוצרים בכוכב בתוך הסל כדי לקבל התראה על ירידת מחיר</p>'}
    </div>

    <div class="card pad">
      <b class="small">📦 המזווה שלי</b>
      ${pantryRows.filter((r) => r.days <= 3).length ? `<div class="banner banner-accent tiny" style="margin-top:8px">${pantryRows.filter((r) => r.days <= 3).length} פריטים מתקרבים לתפוגה - הנה מה אפשר להכין מהם</div>` : ""}
      <p class="note" style="margin-top:6px">${pantryRows.length} פריטים במלאי הביתי</p>
      <div class="stack" style="gap:3px;margin-top:6px;max-height:170px;overflow:auto">
        ${pantryRows.slice(0, 14).map((r) => `<div class="spread tiny"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span>
          <span class="num" style="color:${r.days <= 3 ? "var(--danger)" : "var(--muted)"}">${r.days >= 0 ? "עוד " + r.days + " ימים" : "פג תוקף"}</span></div>`).join("")}
      </div>
      ${ideas.length ? `<div class="hr" style="margin:10px 0"></div><b class="small">מה אפשר להכין מזה</b>
        ${ideas.map((i) => `<p class="tiny muted" style="margin:4px 0"><b style="color:var(--ink)">${esc(i.title)}</b> · ${i.time_min} דק' · ${i.coverage_pct}% מהמצרכים אצלך</p>`).join("")}` : ""}
    </div>

    <div class="card pad">
      <b class="small">👑 CartFit Pro</b>
      <p class="small muted" style="margin:4px 0 8px">מעקב מחירים ללא הגבלה והתראות Push, סל מפוצל בין רשתות, שמירת מתכונים ללא הגבלה וללא מוצרים ממומנים - ₪9.90 לחודש</p>
      <button class="btn ${state.isPro ? "btn-ghost" : "btn-primary"} btn-full" data-act="pro">${state.isPro ? "Pro פעיל · בטל" : "הפעל Pro"}</button>
    </div>

    <div class="card pad">
      <b class="small">איך זה עובד</b>
      <p class="tiny muted" style="margin-top:6px">הפרוטוטייפ מריץ בדפדפן את אותם אלגוריתמים של השרת: Knapsack רב-ברירה לפי משקולות
      קטגוריה, מבצעי מועדון וכמות, מנוע ארוחות (סועדים → גרמים → מארזים), השוואת רשתות ופיצול סל.
      הקטלוג: 93 מוצרים ישראליים, 5 רשתות, 92 מבצעים ו-44 מבצעי כמות.</p>
      <button class="btn btn-ghost btn-full" style="margin-top:10px" data-act="reset">אפס את כל הנתונים</button>
    </div>`;
  }

  /* ------------------------------ render ------------------------------ */
  const SUBTITLES = { home: "סל קניות שנבנה בדיוק לפי התקציב שלך", cart: "הסל החי - נעילה, החלפה וסגירת תקציב",
    meal: "ארוחה לפי מספר סועדים, עם מדריך הכנה", compare: "אותו סל בכל הרשתות", checkout: "רשימה לסניף וייצוא",
    insights: "חיסכון, מעקב מחירים ומזווה" };

  function render() {
    renderTabs();
    subtitle.textContent = SUBTITLES[state.tab];
    const views = { home: homeView, cart: cartView, meal: mealView, compare: compareView,
                    checkout: checkoutView, insights: insightsView };
    view.innerHTML = views[state.tab]();
    save();
  }

  /* ------------------------------ actions ----------------------------- */
  function buildBasket(keepLocks) {
    const locked = keepLocks ? state.items.filter((i) => i.locked).map((i) => ({ gtin: i.gtin, qty: i.qty })) : [];
    const basket = CF.generateBasket({ target_budget: state.budget, store_id: state.storeId, focus: state.focus,
      clubs: state.clubs, locked, healthyOnly: state.healthyOnly, includeDelivery: state.includeDelivery,
      holidayId: state.holidayId, seed: state.seed });
    const prev = Object.fromEntries(state.items.map((i) => [i.gtin, i]));
    basket.items.forEach((i) => {
      const old = prev[i.gtin];
      if (old) { i.locked = i.locked || old.locked; i.substitute_policy = old.substitute_policy; }
    });
    state.basket = basket;
    state.items = basket.items;
  }

  function recalcMeal() {
    state.meal = CF.calculateMeal({ recipe_id: state.recipeId, store_id: state.storeId, adults: state.adults,
      kids: state.kids, sides: state.sides, pantry_keys: state.pantryKeys, clubs: state.clubs });
  }

  const DEMO_RECEIPT = 'רמי לוי שיווק השקמה\nחלב תנובה 3% 1 ליטר 6.90\nפיתות גדולות x2 12.90\nבמבה 80 גרם 4.90\nעגבניות 1 ק"ג 6.80\nסהכ 31.50';
  const DEMO_RECIPE = '500 גרם בשר בקר טחון\n2 יחידות בצל\n1 כוס אורז\n3 כפות שמן זית\n400 גרם רסק עגבניות';

  const ACTIONS = {
    tab: (arg) => { state.tab = arg; state._toast = null; if (arg === "meal" && !state.meal) recalcMeal(); },
    budget: (arg) => { state.budget = +arg; },
    store: (arg) => { state.storeId = arg; if (state.items.length) { state.items = state.items.map((i) =>
        CF.toItem(CF.byGtin[i.gtin], arg, i.qty, state.clubs, { locked: i.locked, checked: i.checked,
          substitute_policy: i.substitute_policy })); } if (state.meal) recalcMeal(); },
    focus: (arg) => { state.focus = arg; },
    holiday: (arg) => { state.holidayId = arg || null;
      const h = D.holidays.find((x) => x.id === arg); if (h) state.budget = h.suggested_budget; },
    club: (arg) => { state.clubs = state.clubs.includes(arg) ? state.clubs.filter((c) => c !== arg) : state.clubs.concat(arg);
      if (state.items.length) ACTIONS.store(state.storeId); if (state.meal) recalcMeal(); },
    toggle: (arg) => { state[arg] = !state[arg]; },
    build: () => { buildBasket(false); state.tab = "cart"; },
    shuffle: () => { state.seed += 1; buildBasket(true); },
    qty: (arg, n) => { const it = state.items.find((i) => i.gtin === arg); if (!it) return;
      const qty = it.qty + (+n); if (qty <= 0) { state.items = state.items.filter((i) => i.gtin !== arg); return; }
      const pr = CF.price(CF.byGtin[arg], state.storeId, state.clubs, qty);
      Object.assign(it, { qty, line_total: pr.total, saved: pr.saved, bundle_hint: pr.bundle_hint,
        bundle_description: pr.bundle ? pr.bundle.description : null }); },
    lock: (arg) => { const it = state.items.find((i) => i.gtin === arg); if (it) it.locked = !it.locked; },
    remove: (arg) => { state.items = state.items.filter((i) => i.gtin !== arg); },
    swap: (arg) => { const next = CF.findSwap(arg, state.storeId, state.clubs, "equivalent",
        state.items.map((i) => i.gtin));
      if (!next) { state._toast = "לא נמצאה חלופה מתאימה למוצר הזה"; return; }
      const idx = state.items.findIndex((i) => i.gtin === arg);
      next.locked = state.items[idx].locked;
      state.items.splice(idx, 1, next); state._toast = "הוחלף ל" + next.name; },
    watch: (arg) => {
      if (state.watch.includes(arg)) { state.watch = state.watch.filter((g) => g !== arg); return; }
      if (!state.isPro && state.watch.length >= 3) { state._toast = "מעקב חינם מוגבל ל-3 מוצרים · CartFit Pro פותח מעקב ללא הגבלה"; return; }
      state.watch = state.watch.concat(arg); },
    policy: (arg) => { state._policyFor = state._policyFor === arg ? null : arg; },
    setpolicy: (arg, n) => { const it = state.items.find((i) => i.gtin === arg); if (it) it.substitute_policy = n;
      state._policyFor = null; },
    addsugg: (arg) => { state.items.push(CF.toItem(CF.byGtin[arg], state.storeId, 1, state.clubs, { source: "suggestion" })); },
    scanopen: () => { state._scanOpen = !state._scanOpen; },
    scan: (arg) => {
      const p = CF.byGtin[arg];
      if (!p) { state.lastScan = { found: false }; return; }
      const rows = CF.compareStores([{ gtin: arg, qty: 1 }], state.clubs, false);
      const here = rows.find((r) => r.store_id === state.storeId) || rows[0];
      const cheapest = rows[0];
      const projected = total() + here.items_total;
      const left = CF.round2(state.budget - projected);
      const saving = CF.round2(here.items_total - cheapest.items_total);
      state.lastScan = { found: true, product: p, prices: rows, fits: left >= 0,
        budgetMsg: left >= 0 ? `נכנס בתקציב - יישארו ${ils(left)}` : `חורג מהתקציב ב-${ils(Math.abs(left))}`,
        cheaper: saving > 0.05 ? `ב${cheapest.store_name} זה זול ב-${ils(saving)}` : null };
    },
    scaninput: () => { const box = document.getElementById("scanBox");
      ACTIONS.scan((box && box.value || "").trim()); },
    addscan: (arg) => { const existing = state.items.find((i) => i.gtin === arg);
      if (existing) ACTIONS.qty(arg, 1);
      else state.items.push(CF.toItem(CF.byGtin[arg], state.storeId, 1, state.clubs, { source: "scan" }));
      state.lastScan = null; state._scanOpen = false; state._toast = "נוסף לסל"; },
    share: () => { state.shareCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      state._toast = "קוד שיתוף נוצר - בן/בת הזוג טוענים את אותו הסל"; },
    importmode: (arg) => { state.importMode = arg; state.importText = ""; state._importMsg = null; },
    demoimport: () => { state.importText = state.importMode === "receipt" ? DEMO_RECEIPT : DEMO_RECIPE; },
    runimport: () => {
      const box = document.getElementById("importBox");
      state.importText = box ? box.value : state.importText;
      if (!state.importText.trim()) { state._importMsg = "הדבק טקסט קודם"; return; }
      const res = state.importMode === "receipt"
        ? CF.parseReceipt(state.importText, state.storeId)
        : CF.importRecipe(state.importText, state.storeId, 4);
      res.items.forEach((i) => { const ex = state.items.find((x) => x.gtin === i.gtin);
        if (ex) ACTIONS.qty(i.gtin, i.qty); else state.items.push(i); });
      state._importMsg = `${res.items.length} מוצרים נוספו · ${ils(res.total)}`
        + (res.message_he ? " · " + res.message_he : "")
        + (res.unmatched_lines.length ? " · לא זוהו: " + res.unmatched_lines.join(" | ") : "");
    },
    recipe: (arg) => { state.recipeId = arg; state.stepsDone = [];
      const r = D.recipes.find((x) => x.id === arg); state.sides = (r.default_sides || []).slice(); recalcMeal(); },
    side: (arg) => { state.sides = state.sides.includes(arg) ? state.sides.filter((s) => s !== arg) : state.sides.concat(arg); recalcMeal(); },
    pantrykey: (arg) => { state.pantryKeys = state.pantryKeys.includes(arg) ? state.pantryKeys.filter((k) => k !== arg) : state.pantryKeys.concat(arg); recalcMeal(); },
    diners: (arg, n) => { state[arg] = Math.max(arg === "adults" ? 1 : 0, state[arg] + (+n)); recalcMeal(); },
    mealtab: (arg) => { state.mealTab = arg; },
    step: (arg) => { const o = +arg; state.stepsDone = state.stepsDone.includes(o)
      ? state.stepsDone.filter((x) => x !== o) : state.stepsDone.concat(o); },
    mealtocart: () => { if (!state.meal) return;
      state.meal.items.forEach((i) => { const ex = state.items.find((x) => x.gtin === i.gtin);
        if (ex) ACTIONS.qty(i.gtin, i.qty); else state.items.push(Object.assign({}, i)); });
      state.budget = Math.max(state.budget, Math.ceil(total() / 10) * 10);
      state.tab = "cart"; state._toast = "הארוחה הועברה לסל"; },
    pro: () => { state.isPro = !state.isPro; },
    check: (arg) => { const it = state.items.find((i) => i.gtin === arg); if (it) it.checked = !it.checked; },
    clearchecks: () => { state.items.forEach((i) => (i.checked = false)); },
    copywa: () => {
      const store = CF.storeById[state.storeId];
      const text = CF.whatsappText(state.items, store.name, total(), state.notes.split("\n").filter(Boolean), state.budget);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast("הרשימה הועתקה")).catch(() => toast("אפשר לסמן ולהעתיק מהתצוגה למעלה"));
      } else toast("אפשר לסמן ולהעתיק מהתצוגה למעלה");
    },
    finish: () => {
      const items = state.items.map((i) => ({ gtin: i.gtin, qty: i.qty }));
      const rows = CF.compareStores(items, state.clubs, false);
      const worst = rows[rows.length - 1].items_total;
      const byCat = {};
      state.items.forEach((i) => (byCat[i.category] = CF.round2((byCat[i.category] || 0) + i.line_total)));
      state.savings.push({ date: new Date().toISOString().slice(0, 10), store_id: state.storeId,
        items_total: total(), worst_total: worst, promo_saved: CF.round2(state.items.reduce((s, i) => s + i.saved, 0)),
        by_category: byCat });
      const today = new Date();
      state.items.forEach((i) => {
        const p = CF.byGtin[i.gtin];
        const expires = new Date(today.getTime() + (p.shelf_life_days || 30) * 86400000).toISOString().slice(0, 10);
        const ex = state.pantry.find((e) => e.gtin === i.gtin);
        if (ex) { ex.qty += i.qty; ex.expires = expires; } else state.pantry.push({ gtin: i.gtin, qty: i.qty, expires });
      });
      const saved = CF.round2(Math.max(0, worst - total()) + state.items.reduce((s, i) => s + i.saved, 0));
      state._checkoutDone = { headline: `הקנייה נרשמה · חסכת ${ilsR(saved)} מול הרשת היקרה ביותר ומיצוי מבצעים`,
                              ideas: CF.leftoverIdeas(state.items.map((i) => i.gtin), 3) };
    },
    cmdfill: (arg) => { state.command = arg; },
    runcmd: () => {
      const box = document.getElementById("cmdBox");
      state.command = box ? box.value : state.command;
      const intent = CF.parseIntent(state.command);
      const parts = [];
      if (intent.budget) { state.budget = intent.budget; parts.push("תקציב ₪" + intent.budget); }
      if (intent.store_id) { state.storeId = intent.store_id; parts.push(CF.storeById[intent.store_id].name); }
      if (intent.holiday_id) { state.holidayId = intent.holiday_id; parts.push((D.holidays.find((h) => h.id === intent.holiday_id) || {}).title); }
      if (intent.healthy_only) { state.healthyOnly = true; parts.push("סל בריא"); }
      if (intent.adults) { state.adults = intent.adults; parts.push(intent.adults + " סועדים"); }
      if (intent.kids) state.kids = intent.kids;
      if (intent.recipe_id) { state.recipeId = intent.recipe_id; recalcMeal();
        parts.push((D.recipes.find((r) => r.id === intent.recipe_id) || {}).title); }
      state._intent = parts.length ? "זיהיתי: " + parts.join(" · ") + ` (ביטחון ${Math.round(intent.confidence * 100)}%)`
                                   : "לא הצלחתי לחלץ פרטים מהמשפט";
      if (intent.mode === "meal" && intent.recipe_id) state.tab = "meal";
    },
    reset: () => { try { localStorage.removeItem("cartfit-prototype"); } catch (e) {}
      state = Object.assign({}, DEFAULTS); },
    theme: () => {
      const root = document.documentElement;
      const now = root.getAttribute("data-theme");
      const next = now === "dark" ? "light" : now === "light" ? null : "dark";
      if (next) root.setAttribute("data-theme", next); else root.removeAttribute("data-theme");
      state.theme = next;
    },
  };

  /* ------------------------------ events ------------------------------ */
  view.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (!fn) return;
    if (el.tagName === "A") return;
    fn(el.dataset.arg, el.dataset.n);
    render();
  });
  document.getElementById("tabs").addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el) { ACTIONS.tab(el.dataset.arg); render(); }
  });
  document.getElementById("themeBtn").addEventListener("click", () => { ACTIONS.theme(); render(); });

  view.addEventListener("input", (e) => {
    if (e.target.id === "budgetRange") {
      state.budget = +e.target.value;
      const pct = ((state.budget - 50) / 1450) * 100;
      e.target.style.background = `linear-gradient(to left, var(--brand) ${pct}%, var(--line) ${pct}%)`;
      const big = view.querySelector(".bignum");
      if (big) big.textContent = ilsR(state.budget);
      const btn = view.querySelector('[data-act="build"]');
      if (btn) btn.textContent = `✨ בנה לי סל ב-${ilsR(state.budget)}`;
      save();
    }
    if (e.target.id === "notesBox") { state.notes = e.target.value; save(); }
    if (e.target.id === "importBox") { state.importText = e.target.value; save(); }
    if (e.target.id === "cmdBox") { state.command = e.target.value; save(); }
  });

  window.addEventListener("scroll", () => {
    document.getElementById("appbar").classList.toggle("stuck", window.scrollY > 8);
  }, { passive: true });

  /* ------------------------------ boot -------------------------------- */
  if (state.theme) document.documentElement.setAttribute("data-theme", state.theme);
  if (!state.items.length) buildBasket(false);
  if (!state.meal) recalcMeal();
  render();
})();
