/* Per-device persistence for the state the server would otherwise hold.
 *
 * The Android build and the offline website have no backend, so savings
 * history, the watchlist, the virtual pantry, shared-cart codes and community
 * meals live in localStorage. Every accessor is guarded: a private window or
 * blocked site data must degrade to an empty store, never throw.
 */

const KEY = "cartfit-local-store";

export interface SavingsEntry {
  date: string;
  store_id: string;
  items_total: number;
  worst_total: number;
  promo_saved: number;
  by_category: Record<string, number>;
}
export interface PantryEntry { gtin: string; qty: number; expires_at: string; bought_at: string }
export interface WatchEntry { gtin: string; reference_price: number; created_at: string }
export interface CommunityMeal { id: number; title: string; servings: number; budget: number; payload: any; author: string; created_at: string; likes: number }

interface Store {
  savings: SavingsEntry[];
  watchlist: WatchEntry[];
  pantry: PantryEntry[];
  shares: Record<string, { payload: any; created_at: string; updated_at: string; revision: number }>;
  community: CommunityMeal[];
}

const EMPTY: Store = { savings: [], watchlist: [], pantry: [], shares: {}, community: [] };

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — the session still works, it just won't persist */
  }
}

function mutate<T>(fn: (store: Store) => T): T {
  const store = read();
  const result = fn(store);
  write(store);
  return result;
}

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const localStore = {
  // ------------------------------- savings ------------------------------- //
  savings: () => read().savings,

  logBasket(entry: SavingsEntry) {
    mutate((s) => s.savings.push(entry));
  },

  // ------------------------------ watchlist ------------------------------ //
  watchlist: () => read().watchlist,

  watchAdd(gtin: string, referencePrice: number) {
    mutate((s) => {
      if (!s.watchlist.some((w) => w.gtin === gtin)) {
        s.watchlist.push({ gtin, reference_price: referencePrice, created_at: nowIso() });
      }
    });
  },

  watchRemove(gtin: string) {
    mutate((s) => { s.watchlist = s.watchlist.filter((w) => w.gtin !== gtin); });
  },

  // -------------------------------- pantry ------------------------------- //
  pantry: () => read().pantry,

  /** After checkout the cart becomes the pantry, each line dated by its shelf life. */
  stock(entries: { gtin: string; qty: number; shelf_life_days: number }[]) {
    mutate((s) => {
      entries.forEach((e) => {
        const expires = new Date(Date.now() + (e.shelf_life_days || 30) * 86400000).toISOString().slice(0, 10);
        const existing = s.pantry.find((p) => p.gtin === e.gtin);
        if (existing) { existing.qty += e.qty; existing.expires_at = expires; }
        else s.pantry.push({ gtin: e.gtin, qty: e.qty, expires_at: expires, bought_at: today() });
      });
    });
  },

  pantryRemove(gtin: string) {
    mutate((s) => { s.pantry = s.pantry.filter((p) => p.gtin !== gtin); });
  },

  // ----------------------------- shared carts ---------------------------- //
  /** Household cart: a short code both partners load. Device-local without a server. */
  sharePut(payload: any, code?: string): string {
    return mutate((s) => {
      const key = (code || Array.from({ length: 6 }, () =>
        CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("")).toUpperCase();
      const existing = s.shares[key];
      s.shares[key] = { payload, created_at: existing?.created_at || nowIso(),
                        updated_at: nowIso(), revision: (existing?.revision || 0) + 1 };
      return key;
    });
  },

  shareGet(code: string) {
    return read().shares[(code || "").toUpperCase()] || null;
  },

  // ------------------------------ community ------------------------------ //
  community: () => read().community.slice().sort((a, b) => b.likes - a.likes || b.id - a.id),

  communityAdd(title: string, servings: number, budget: number, payload: any, author = "משתמש CartFit") {
    return mutate((s) => {
      const id = (s.community.reduce((max, m) => Math.max(max, m.id), 0) || 0) + 1;
      s.community.push({ id, title, servings, budget, payload, author, created_at: nowIso(), likes: 0 });
      return id;
    });
  },

  communityLike(id: number) {
    mutate((s) => { const m = s.community.find((x) => x.id === id); if (m) m.likes += 1; });
  },

  reset() {
    try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  },
};
