"use client";

import { useEffect, useState } from "react";
import { Star, Bell, Package, Crown, Loader2 } from "lucide-react";
import SavingsCard from "@/components/SavingsCard";
import CategoryDonut from "@/components/CategoryDonut";
import { api } from "@/lib/api";
import { ils } from "@/lib/format";
import { useCartStore } from "@/store/useCartStore";

export default function InsightsPage() {
  const s = useCartStore();
  const [savings, setSavings] = useState<any>(null);
  const [watch, setWatch] = useState<any>(null);
  const [pantry, setPantry] = useState<any>(null);

  const reload = () => {
    api.savings().then(setSavings).catch(() => {});
    api.watchlist("demo", s.isPro).then(setWatch).catch(() => {});
    api.pantry().then(setPantry).catch(() => {});
  };
  useEffect(reload, [s.isPro]);

  if (!savings) return <main className="flex justify-center p-10"><Loader2 className="animate-spin text-brand" /></main>;

  const split = savings.category_split?.length ? savings.category_split : [];
  const splitTotal = split.reduce((t: number, c: any) => t + c.total, 0);

  return (
    <main className="space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold">התובנות שלי</h1>
        <p className="text-sm text-ink-muted">חיסכון, מעקב מחירים והמזווה הביתי</p>
      </header>

      <SavingsCard summary={savings} />

      {split.length > 0 && <CategoryDonut data={split} total={splitTotal} title="הוצאות החודש לפי קטגוריה" />}

      <div className="card p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Star size={15} className="text-accent" />מעקב מחירים
          {watch?.limit && <span className="tag bg-slate-100 text-ink-muted">עד {watch.limit} מוצרים בחינם</span>}
        </p>
        {watch?.alerts?.length > 0 && (
          <div className="mb-2 space-y-1">
            {watch.alerts.map((a: any) => (
              <p key={a.gtin} className="flex items-start gap-1.5 rounded-xl bg-accent-light p-2 text-[11px] text-amber-900">
                <Bell size={12} className="mt-0.5 shrink-0" /><span><b>{a.push_title}</b> · {a.push_body}</span>
              </p>
            ))}
          </div>
        )}
        {watch?.items?.length ? watch.items.map((i: any) => (
          <div key={i.gtin} className="flex items-center justify-between border-t border-slate-100 py-2 text-xs first:border-0">
            <span className="min-w-0 truncate">{i.name}</span>
            <span className="shrink-0 text-left">
              <b>{ils(i.best_price)}</b> <span className="text-ink-muted">· {i.best_store_name}</span>
              {i.drop_pct > 0 && <span className="mr-1 text-brand-dark">{i.drop_pct}%-</span>}
            </span>
          </div>
        )) : <p className="text-xs text-ink-muted">סמן מוצרים בכוכב בתוך הסל כדי לקבל התראה על ירידת מחיר</p>}
      </div>

      <div className="card p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Package size={15} className="text-brand" />המזווה שלי
        </p>
        {pantry?.message_he && <p className="mb-2 rounded-xl bg-accent-light p-2 text-[11px] text-amber-900">{pantry.message_he}</p>}
        <p className="text-xs text-ink-muted">{pantry?.items?.length || 0} פריטים במלאי הביתי</p>
        <div className="mt-2 space-y-1">
          {pantry?.items?.slice(0, 8).map((i: any) => (
            <div key={i.gtin} className="flex justify-between text-[11px]">
              <span className="truncate">{i.name}</span>
              <span className={i.days_left <= 3 ? "text-red-500" : "text-ink-muted"}>
                {i.days_left >= 0 ? `עוד ${i.days_left} ימים` : "פג תוקף"}
              </span>
            </div>
          ))}
        </div>
        {pantry?.leftover_ideas?.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <p className="mb-1 text-xs font-semibold">מה אפשר להכין מזה</p>
            {pantry.leftover_ideas.map((idea: any) => (
              <p key={idea.id} className="text-[11px] text-ink-muted">
                <b className="text-ink">{idea.title}</b> · {idea.time_min} דק' · {idea.coverage_pct}% מהמצרכים אצלך
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Crown size={15} className="text-accent" />CartFit Pro</p>
        <p className="mt-1 text-xs text-ink-muted">
          מעקב מחירים ללא הגבלה, התראות Push, סל מפוצל בין רשתות וללא מוצרים ממומנים - ₪9.90 לחודש
        </p>
        <button onClick={() => s.setPro(!s.isPro)} className={`mt-2 w-full ${s.isPro ? "btn-ghost" : "btn-primary"}`}>
          {s.isPro ? "Pro פעיל - בטל" : "הפעל Pro"}
        </button>
      </div>
    </main>
  );
}
