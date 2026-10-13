"use client";

import { Minus, Plus } from "lucide-react";

export default function MealSelector({
  recipes, sides, recipeId, onRecipe, selectedSides, onToggleSide,
  adults, kids, onAdults, onKids, pantryKeys, onTogglePantry,
}: {
  recipes: any[]; sides: any[]; recipeId: string; onRecipe: (id: string) => void;
  selectedSides: string[]; onToggleSide: (id: string) => void;
  adults: number; kids: number; onAdults: (n: number) => void; onKids: (n: number) => void;
  pantryKeys: string[]; onTogglePantry: (key: string) => void;
}) {
  const counter = (label: string, value: number, set: (n: number) => void, min = 0) => (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="flex items-center gap-3">
        <button onClick={() => set(Math.max(min, value - 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"><Minus size={14} /></button>
        <span className="min-w-6 text-center text-lg font-bold">{value}</span>
        <button onClick={() => set(value + 1)} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"><Plus size={14} /></button>
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <p className="text-sm font-semibold">כמה סועדים?</p>
        {counter("מבוגרים", adults, onAdults, 1)}
        {counter("ילדים (נספרים כ-0.6)", kids, onKids)}
        <p className="text-[11px] text-ink-muted">
          סה"כ מנות: <b>{(adults + kids * 0.6).toFixed(1)}</b>
        </p>
      </div>

      <div className="card p-4">
        <p className="mb-2 text-sm font-semibold">המנה המרכזית</p>
        <div className="grid grid-cols-2 gap-2">
          {recipes.map((r) => (
            <button key={r.id} onClick={() => onRecipe(r.id)}
              className={`flex items-center gap-2 rounded-2xl border p-3 text-right transition-all ${
                recipeId === r.id ? "border-brand bg-brand/5" : "border-slate-200 hover:border-slate-300"}`}>
              <span className="text-2xl">{r.emoji}</span>
              <span>
                <span className="block text-sm font-semibold">{r.title}</span>
                <span className="block text-[11px] text-ink-muted">{r.total_time_min} דק' · {r.steps_count} שלבים</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <p className="mb-2 text-sm font-semibold">תוספות</p>
        <div className="flex flex-wrap gap-2">
          {sides.map((s) => (
            <button key={s.id} onClick={() => onToggleSide(s.id)}
              className={`chip ${selectedSides.includes(s.id) ? "chip-on" : "chip-off"}`}>
              <span>{s.emoji}</span>{s.title}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <p className="mb-1 text-sm font-semibold">יש לי בבית (לא להוסיף לסל)</p>
        <p className="mb-2 text-[11px] text-ink-muted">שמן, מלח ותבלינים בדרך כלל כבר במזווה</p>
        <div className="flex flex-wrap gap-2">
          {["oil", "spice", "paprika", "ketchup", "charcoal", "foil", "plates"].map((k) => (
            <button key={k} onClick={() => onTogglePantry(k)}
              className={`chip ${pantryKeys.includes(k) ? "chip-on" : "chip-off"}`}>
              {{ oil: "שמן", spice: "תבלינים", paprika: "פפריקה", ketchup: "קטשופ",
                 charcoal: "פחמים", foil: "אלומיניום", plates: "חד פעמי" }[k]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
