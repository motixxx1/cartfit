"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Split, Crown, Lock } from "lucide-react";
import PriceCompareCard from "@/components/PriceCompareCard";
import { api } from "@/lib/api";
import { ils } from "@/lib/format";
import { useCartStore } from "@/store/useCartStore";

export default function ComparePage() {
  const s = useCartStore();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = async (allowSplit: boolean) => {
    if (!s.items.length) return;
    setBusy(true);
    try {
      setData(await api.compare({
        items: s.lockedPayload(), clubs: s.clubs, include_delivery: true, allow_split: allowSplit,
      }));
    } finally { setBusy(false); }
  };

  useEffect(() => { load(s.isPro); /* eslint-disable-next-line */ }, [s.items.length, s.clubs, s.isPro]);

  if (!s.items.length) {
    return (
      <main className="space-y-3 p-4 pt-10 text-center">
        <p className="text-lg font-semibold">אין מה להשוות עדיין</p>
        <Link href="/" className="btn-primary inline-flex">בנה סל</Link>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold">השוואת רשתות</h1>
        <p className="text-sm text-ink-muted">אותו סל של {s.items.length} מוצרים, בכל הרשתות</p>
      </header>

      {busy && !data && <p className="flex justify-center p-6"><Loader2 className="animate-spin text-brand" /></p>}

      {data && (
        <>
          <div className="card bg-gradient-to-l from-brand to-emerald-600 p-4 text-white">
            <p className="text-sm opacity-90">אפשר לחסוך עד</p>
            <p className="text-4xl font-extrabold">{ils(data.max_saving)}</p>
            <p className="text-xs opacity-90">
              הכי זול: {data.stores[0].store_name} ({ils(data.best_total)}) · הכי יקר: {ils(data.worst_total)}
            </p>
          </div>

          <PriceCompareCard rows={data.stores} currentStoreId={s.storeId}
            onPick={(id) => { s.setStore(id); }} />

          <div className="card p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Split size={16} className="text-brand" />סל מפוצל בין שתי רשתות
              {!s.isPro && <span className="tag bg-accent-light text-amber-800"><Crown size={11} />Pro</span>}
            </p>

            {s.isPro ? (
              data.split ? (
                <>
                  <p className="mb-2 text-xs text-brand-dark">{data.split_message_he}</p>
                  {data.split.map((g: any) => (
                    <div key={g.store_id} className="mb-2 rounded-xl bg-slate-50 p-3">
                      <p className="flex justify-between text-sm font-semibold">
                        <span>{g.store_name} {g.pickup && <span className="tag bg-white text-ink-muted">איסוף עצמי</span>}</span>
                        <span>{ils(g.items_total)}</span>
                      </p>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        {g.items.slice(0, 6).map((i: any) => i.name.split(" ").slice(0, 2).join(" ")).join(" · ")}
                        {g.items.length > 6 && ` ועוד ${g.items.length - 6}`}
                      </p>
                    </div>
                  ))}
                  <p className="text-sm font-bold">סה"כ מפוצל: {ils(data.split_total)}</p>
                </>
              ) : (
                <p className="text-xs text-ink-muted">{data.split_message_he || "פיצול לא משתלם לסל הזה"}</p>
              )
            ) : (
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <Lock size={18} className="mx-auto text-ink-muted" />
                <p className="mt-1 text-xs text-ink-soft">
                  CartFit Pro מחשב פיצול אופטימלי בין שתי רשתות וחוסך עוד עשרות שקלים בחודש
                </p>
                <button onClick={() => s.setPro(true)} className="btn-primary mt-2 !py-2 text-sm">
                  נסה Pro ב-₪9.90 לחודש
                </button>
              </div>
            )}
          </div>

          <Link href="/checkout" className="btn-primary w-full">המשך לרשימת הקנייה</Link>
        </>
      )}
    </main>
  );
}
