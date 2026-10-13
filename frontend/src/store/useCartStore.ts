"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Basket, CartItem, MealResult, SubstitutePolicy } from "@/lib/types";

/**
 * Single source of truth for the cart.
 * Persisted to localStorage so the in-store checklist keeps working with no
 * signal (Phase 9 - offline-first); the checklist state lives here too.
 */
interface CartState {
  // settings
  budget: number;
  storeId: string;
  focus: "balanced" | "pantry" | "weekend";
  clubs: string[];
  holidayId: string | null;
  seasonId: string | null;
  healthyOnly: boolean;
  includeDelivery: boolean;
  isPro: boolean;
  mode: "budget" | "meal";

  // data
  basket: Basket | null;
  meal: MealResult | null;
  items: CartItem[];
  seed: number;
  lastSyncedAt: string | null;
  shareCode: string | null;

  // setters
  setBudget: (v: number) => void;
  setStore: (id: string) => void;
  setFocus: (f: CartState["focus"]) => void;
  toggleClub: (id: string) => void;
  setHoliday: (id: string | null) => void;
  setSeason: (id: string | null) => void;
  setHealthyOnly: (v: boolean) => void;
  setIncludeDelivery: (v: boolean) => void;
  setPro: (v: boolean) => void;
  setMode: (m: CartState["mode"]) => void;

  // cart ops
  setBasket: (b: Basket) => void;
  setMeal: (m: MealResult) => void;
  addItem: (item: CartItem) => void;
  removeItem: (gtin: string) => void;
  setQty: (gtin: string, qty: number) => void;
  toggleLock: (gtin: string) => void;
  toggleChecked: (gtin: string) => void;
  replaceItem: (gtin: string, next: CartItem) => void;
  setSubstitutePolicy: (gtin: string, policy: SubstitutePolicy) => void;
  bumpSeed: () => void;
  setShareCode: (c: string | null) => void;
  clearChecks: () => void;

  // derived
  total: () => number;
  remaining: () => number;
  lockedPayload: () => { gtin: string; qty: number }[];
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      budget: 350,
      storeId: "shufersal",
      focus: "balanced",
      clubs: [],
      holidayId: null,
      seasonId: null,
      healthyOnly: false,
      includeDelivery: false,
      isPro: false,
      mode: "budget",

      basket: null,
      meal: null,
      items: [],
      seed: 0,
      lastSyncedAt: null,
      shareCode: null,

      setBudget: (v) => set({ budget: v }),
      setStore: (id) => set({ storeId: id }),
      setFocus: (f) => set({ focus: f }),
      toggleClub: (id) =>
        set((s) => ({ clubs: s.clubs.includes(id) ? s.clubs.filter((c) => c !== id) : [...s.clubs, id] })),
      setHoliday: (id) => set({ holidayId: id }),
      setSeason: (id) => set({ seasonId: id }),
      setHealthyOnly: (v) => set({ healthyOnly: v }),
      setIncludeDelivery: (v) => set({ includeDelivery: v }),
      setPro: (v) => set({ isPro: v }),
      setMode: (m) => set({ mode: m }),

      setBasket: (b) =>
        set((s) => ({
          basket: b,
          // keep locks and checklist ticks across regenerations
          items: b.items.map((i) => {
            const prev = s.items.find((p) => p.gtin === i.gtin);
            return { ...i, locked: i.locked || prev?.locked || false, checked: prev?.checked || false,
                     substitute_policy: prev?.substitute_policy || i.substitute_policy || "brand_alternative" };
          }),
          lastSyncedAt: new Date().toISOString(),
        })),
      setMeal: (m) => set({ meal: m, items: m.items, lastSyncedAt: new Date().toISOString() }),

      addItem: (item) =>
        set((s) => {
          const existing = s.items.find((i) => i.gtin === item.gtin);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.gtin === item.gtin
                  ? { ...i, qty: i.qty + item.qty, line_total: +(i.unit_price * (i.qty + item.qty)).toFixed(2) }
                  : i),
            };
          }
          return { items: [...s.items, item] };
        }),
      removeItem: (gtin) => set((s) => ({ items: s.items.filter((i) => i.gtin !== gtin) })),
      setQty: (gtin, qty) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.gtin === gtin ? { ...i, qty, line_total: +(i.unit_price * qty).toFixed(2) } : i))
            .filter((i) => i.qty > 0),
        })),
      toggleLock: (gtin) =>
        set((s) => ({ items: s.items.map((i) => (i.gtin === gtin ? { ...i, locked: !i.locked } : i)) })),
      toggleChecked: (gtin) =>
        set((s) => ({ items: s.items.map((i) => (i.gtin === gtin ? { ...i, checked: !i.checked } : i)) })),
      replaceItem: (gtin, next) =>
        set((s) => ({ items: s.items.map((i) => (i.gtin === gtin ? { ...next, locked: i.locked } : i)) })),
      setSubstitutePolicy: (gtin, policy) =>
        set((s) => ({ items: s.items.map((i) => (i.gtin === gtin ? { ...i, substitute_policy: policy } : i)) })),
      bumpSeed: () => set((s) => ({ seed: s.seed + 1 })),
      setShareCode: (c) => set({ shareCode: c }),
      clearChecks: () => set((s) => ({ items: s.items.map((i) => ({ ...i, checked: false })) })),

      total: () => +get().items.reduce((sum, i) => sum + i.line_total, 0).toFixed(2),
      remaining: () => +(get().budget - get().total()).toFixed(2),
      lockedPayload: () => get().items.map((i) => ({ gtin: i.gtin, qty: i.qty })),
    }),
    {
      name: "cartfit-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        budget: s.budget, storeId: s.storeId, focus: s.focus, clubs: s.clubs,
        holidayId: s.holidayId, seasonId: s.seasonId, healthyOnly: s.healthyOnly,
        includeDelivery: s.includeDelivery, isPro: s.isPro, mode: s.mode,
        items: s.items, basket: s.basket, meal: s.meal, seed: s.seed,
        lastSyncedAt: s.lastSyncedAt, shareCode: s.shareCode,
      }),
    },
  ),
);
