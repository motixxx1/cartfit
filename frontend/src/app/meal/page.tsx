"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, ChefHat, Loader2, Flame, Share2 } from "lucide-react";
import MealSelector from "@/components/MealSelector";
import RecipeSteps from "@/components/RecipeSteps";
import ProductCard from "@/components/ProductCard";
import { api } from "@/lib/api";
import { ils } from "@/lib/format";
import { useCartStore } from "@/store/useCartStore";

export default function MealPage() {
  const s = useCartStore();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [sides, setSides] = useState<any[]>([]);
  const [recipeId, setRecipeId] = useState("shawarma");
  const [selectedSides, setSelectedSides] = useState<string[]>(["chips", "tahini", "salad", "pita"]);
  const [pantryKeys, setPantryKeys] = useState<string[]>(["oil", "spice"]);
  const [adults, setAdults] = useState(4);
  const [kids, setKids] = useState(0);
  const [tab, setTab] = useState<"cart" | "guide">("cart");
  const [meal, setMeal] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { api.recipes().then((d) => { setRecipes(d.recipes); setSides(d.sides); }).catch(() => {}); }, []);

  useEffect(() => {
    let cancel = false;
    setBusy(true);
    api.calculateMeal({ recipe_id: recipeId, store_id: s.storeId, adults_count: adults, kids_count: kids,
                        sides: selectedSides, pantry_keys: pantryKeys, clubs: s.clubs })
      .then((m) => { if (!cancel) setMeal(m); })
      .catch(() => {})
      .finally(() => !cancel && setBusy(false));
    return () => { cancel = true; };
  }, [recipeId, adults, kids, selectedSides, pantryKeys, s.storeId, s.clubs]);

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const shareToCommunity = async () => {
    if (!meal) return;
    await api.shareMeal({ title: `${meal.title} ל-${adults + kids} סועדים ב-₪${Math.round(meal.total)}`,
                          servings: adults + kids, budget: meal.total,
                          payload: { items: meal.items, recipe_id: recipeId } });
    setToast("הארוחה שותפה לקהילה 🎉");
  };

  return (
    <main className="space-y-4 p-4">
      <header className="pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <ChefHat className="text-accent" />מצב שף
        </h1>
        <p className="text-sm text-ink-muted">בוחרים מנה וכמות סועדים - מקבלים סל מדויק ומדריך הכנה</p>
      </header>

      <MealSelector recipes={recipes} sides={sides} recipeId={recipeId} onRecipe={setRecipeId}
        selectedSides={selectedSides} onToggleSide={(id) => toggle(selectedSides, setSelectedSides, id)}
        adults={adults} kids={kids} onAdults={setAdults} onKids={setKids}
        pantryKeys={pantryKeys} onTogglePantry={(k) => toggle(pantryKeys, setPantryKeys, k)} />

      {busy && !meal && <p className="flex justify-center p-4"><Loader2 className="animate-spin text-brand" /></p>}

      {meal && (
        <>
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-l from-accent to-amber-500 p-4 text-white">
              <p className="text-sm opacity-90">{meal.emoji} {meal.title} · {meal.servings} מנות</p>
              <p className="mt-1 text-3xl font-extrabold">{ils(meal.total)}</p>
              <p className="text-sm">רק {ils(meal.per_serving)} לסועד · חיסכון של {meal.saving_pct}% מהזמנת משלוח
                ({ils(meal.delivery_total)})</p>
            </div>
            <div className="grid grid-cols-4 divide-x divide-x-reverse divide-slate-100 text-center text-[11px]">
              {[["קלוריות", meal.nutrition_per_serving.calories], ["חלבון", `${meal.nutrition_per_serving.protein_g} ג'`],
                ["פחמימות", `${meal.nutrition_per_serving.carbs_g} ג'`], ["שומן", `${meal.nutrition_per_serving.fat_g} ג'`]]
                .map(([label, value]) => (
                <div key={label as string} className="p-2">
                  <p className="text-ink-muted">{label}</p>
                  <p className="text-sm font-bold">{value}</p>
                </div>
              ))}
            </div>
            <p className="border-t border-slate-100 p-2 text-center text-[11px] text-ink-muted">לכל סועד</p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setTab("cart")} className={`chip flex-1 justify-center ${tab === "cart" ? "chip-on" : "chip-off"}`}>
              🛒 מצרכים בסל
            </button>
            <button onClick={() => setTab("guide")} className={`chip flex-1 justify-center ${tab === "guide" ? "chip-on" : "chip-off"}`}>
              👨‍🍳 מדריך הכנה
            </button>
          </div>

          {tab === "cart" ? (
            <div className="space-y-2">
              {meal.excluded_pantry.length > 0 && (
                <p className="rounded-xl bg-slate-100 p-2.5 text-xs text-ink-soft">
                  לא נוספו לסל (יש לך בבית): {meal.excluded_pantry.join(" · ")}
                </p>
              )}
              {meal.quantities.map((q: any) => (
                <div key={q.key} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs shadow-sm">
                  <span className="font-medium">{q.label}</span>
                  <span className="text-ink-muted">
                    {q.needed}{q.unit === "unit" ? " יח'" : q.unit} → {q.packs} × {q.product}
                  </span>
                </div>
              ))}
              {meal.items.map((i: any) => <ProductCard key={i.gtin} item={i} compact />)}
            </div>
          ) : (
            <RecipeSteps steps={meal.steps} totalTime={meal.total_time_min} />
          )}

          {toast && <p className="rounded-xl bg-brand/10 p-2 text-center text-xs text-brand-dark">{toast}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={shareToCommunity} className="btn-ghost"><Share2 size={16} />שתף לקהילה</button>
            <Link href="/cart" className="btn-primary"
              onClick={() => { s.setMeal(meal); s.setBudget(Math.max(s.budget, Math.ceil(meal.total / 10) * 10)); }}>
              <ShoppingCart size={16} />העבר לסל
            </Link>
          </div>
          <p className="flex items-center justify-center gap-1 pb-2 text-[11px] text-ink-muted">
            <Flame size={12} className="text-accent" />הכמויות מחושבות לפי {adults} מבוגרים ו-{kids} ילדים (ילד = 0.6 מנה)
          </p>
        </>
      )}
    </main>
  );
}
