"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChefHat, Loader2, Leaf, Truck, CreditCard, BarChart3 } from "lucide-react";
import BudgetSlider from "@/components/BudgetSlider";
import StorePicker from "@/components/StorePicker";
import HolidayPresets from "@/components/HolidayPresets";
import VoiceInput from "@/components/VoiceInput";
import { api } from "@/lib/api";
import { useCartStore } from "@/store/useCartStore";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const s = useCartStore();
  const [stores, setStores] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    api.stores().then((d) => { setStores(d.stores); setClubs(d.clubs); }).catch(() => {});
    api.presets().then((d) => setPresets(d.holidays)).catch(() => {});
  }, []);

  const build = async () => {
    setBusy(true); setError(null);
    try {
      const basket = await api.generateBasket({
        target_budget: s.budget, store_id: s.storeId, category_focus: s.focus,
        clubs: s.clubs, healthy_only: s.healthyOnly,
        include_delivery_in_budget: s.includeDelivery,
        holiday_id: s.holidayId, season_id: s.seasonId, seed: s.seed,
      });
      s.setBasket(basket);
      router.push("/cart");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const handleVoice = async (text: string) => {
    setBusy(true);
    try {
      const intent = await api.voice(text);
      if (intent.budget) s.setBudget(intent.budget);
      if (intent.store_id) s.setStore(intent.store_id);
      if (intent.holiday_id) s.setHoliday(intent.holiday_id);
      if (intent.healthy_only) s.setHealthyOnly(true);
      setHint(`זיהיתי: ${intent.budget ? `תקציב ₪${intent.budget} ` : ""}${intent.store_name || ""} ${intent.recipe_title || ""}`.trim());
      if (intent.mode === "meal" && intent.recipe_id) { s.setMode("meal"); router.push("/meal"); }
    } catch { /* keep the manual flow */ } finally { setBusy(false); }
  };

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-start justify-between pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            CartFit <span className="text-brand">· סל-פיקס</span>
          </h1>
          <p className="text-sm text-ink-muted">סל קניות שנבנה בדיוק לפי התקציב שלך</p>
        </div>
        <Link href="/insights" className="rounded-xl border border-slate-200 bg-white p-2.5 text-ink-soft"
              aria-label="התובנות שלי">
          <BarChart3 size={18} />
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => s.setMode("budget")}
          className={`rounded-2xl border p-3 text-right transition-all ${
            s.mode === "budget" ? "border-brand bg-brand/5" : "border-slate-200 bg-white"}`}>
          <Sparkles size={18} className="text-brand" />
          <p className="mt-1 text-sm font-bold">סל חכם לפי תקציב</p>
          <p className="text-[11px] text-ink-muted">האלגוריתם ממלא את הסל</p>
        </button>
        <button onClick={() => { s.setMode("meal"); router.push("/meal"); }}
          className={`rounded-2xl border p-3 text-right transition-all ${
            s.mode === "meal" ? "border-brand bg-brand/5" : "border-slate-200 bg-white"}`}>
          <ChefHat size={18} className="text-accent" />
          <p className="mt-1 text-sm font-bold">מצב שף</p>
          <p className="text-[11px] text-ink-muted">ארוחה לפי מספר סועדים</p>
        </button>
      </div>

      <VoiceInput onTranscript={handleVoice} busy={busy} />
      {hint && <p className="rounded-xl bg-brand/5 p-2 text-center text-xs text-brand-dark">{hint}</p>}

      <BudgetSlider value={s.budget} onChange={s.setBudget} />
      <StorePicker stores={stores} value={s.storeId} onChange={s.setStore} budget={s.budget} />
      <HolidayPresets presets={presets} value={s.holidayId}
        onPick={(id, budget) => { s.setHoliday(id); if (budget) s.setBudget(budget); }} />

      <div className="card space-y-3 p-4">
        <p className="text-sm font-semibold">סוג הסל</p>
        <div className="flex gap-2">
          {([["balanced", "מאוזן"], ["pantry", "מילוי מזווה"], ["weekend", "סוף שבוע"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => s.setFocus(id)}
              className={`chip flex-1 justify-center ${s.focus === id ? "chip-on" : "chip-off"}`}>{label}</button>
          ))}
        </div>

        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2"><Leaf size={15} className="text-brand" />סל בריא (ללא סימוני אזהרה)</span>
          <input type="checkbox" checked={s.healthyOnly} onChange={(e) => s.setHealthyOnly(e.target.checked)}
                 className="h-5 w-5 accent-emerald-500" />
        </label>

        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2"><Truck size={15} className="text-brand" />כלול דמי משלוח בתקציב</span>
          <input type="checkbox" checked={s.includeDelivery} onChange={(e) => s.setIncludeDelivery(e.target.checked)}
                 className="h-5 w-5 accent-emerald-500" />
        </label>
      </div>

      <div className="card p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CreditCard size={15} className="text-brand" />מועדוני לקוחות שלי
        </p>
        <div className="flex flex-wrap gap-2">
          {clubs.map((c) => (
            <button key={c.id} onClick={() => s.toggleClub(c.id)}
              className={`chip ${s.clubs.includes(c.id) ? "chip-on" : "chip-off"}`}>{c.name}</button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">הנחות מועדון משוקללות רק למי שזכאי להן</p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <button onClick={build} disabled={busy} className="btn-primary w-full !py-4 text-base disabled:opacity-60">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
        בנה לי סל ב-₪{s.budget}
      </button>
    </main>
  );
}
