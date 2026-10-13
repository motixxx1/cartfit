/**
 * CartFit content script.
 *
 * Israeli chains do not publish an "add by barcode" API, so the extension
 * drives the site's own search box the way a shopper would: for every line it
 * searches the barcode (falling back to the product name), clicks the first
 * "add to cart" button and moves on. Selectors are per-chain and kept here so
 * they can be updated without touching the app.
 */
const SELECTORS = {
  "shufersal.co.il": { search: "input[name='text'], #js-site-search-input", addToCart: "button.js-add-to-cart, button[data-add-to-cart]" },
  "rami-levy.co.il": { search: "input[type='search'], input[placeholder*='חיפוש']", addToCart: "button.add-to-cart, .product-add button" },
  "carrefour.co.il": { search: "input[type='search']", addToCart: "button[class*='add']" },
  "victoryonline.co.il": { search: "input[type='search']", addToCart: "button[class*='add']" },
  "yochananof.co.il": { search: "input[name='text'], input[type='search']", addToCart: "button[class*='add']" },
};

const host = Object.keys(SELECTORS).find((h) => location.hostname.includes(h));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function banner(text) {
  let el = document.getElementById("cartfit-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "cartfit-banner";
    el.style.cssText =
      "position:fixed;inset-inline:0;top:0;z-index:999999;background:#10B981;color:#fff;" +
      "font:600 14px Heebo,system-ui,sans-serif;padding:10px;text-align:center;direction:rtl";
    document.body.appendChild(el);
  }
  el.textContent = text;
}

async function injectCart(payload) {
  if (!host) return banner("CartFit: האתר הזה לא נתמך עדיין");
  const { search, addToCart } = SELECTORS[host];
  let added = 0;

  for (const [index, line] of payload.items.entries()) {
    banner(`CartFit: מוסיף ${index + 1}/${payload.items.length} - ${line.name}`);
    const box = document.querySelector(search);
    if (!box) break;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(box, line.gtin || line.name);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await sleep(1600);

    const btn = document.querySelector(addToCart);
    if (btn) {
      for (let q = 0; q < (line.qty || 1); q++) { btn.click(); await sleep(350); }
      added++;
    }
    await sleep(600);
  }
  banner(`CartFit: הוספו ${added} מתוך ${payload.items.length} פריטים`);
  setTimeout(() => document.getElementById("cartfit-banner")?.remove(), 6000);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "CARTFIT_INJECT") injectCart(msg.payload);
});
