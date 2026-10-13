"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, ExternalLink, WifiOff, Check, Chrome, Utensils, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { ils, ilsShort, SUBSTITUTE_LABELS } from "@/lib/format";
import { useCartStore } from "@/store/useCartStore";

export default function CheckoutPage() {
  const s = useCartStore();
  const [exportData, setExportData] = useState<any>(null);
  const [notes, setNotes] = useState("בשר טרי בלבד\nעגבניות קשות");
  const [offline, setOffline] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const total = s.total();
  const checked = s.items.filter((i) => i.checked).length;

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    addEventListener("online", update); addEventListener("offline", update);
    return () => { removeEventListener("online", update); removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    if (!s.items.length || offline) return;
    api.exportCart({ items: s.lockedPayload(), store_id: s.storeId, budget: s.budget,
                     picker_notes: notes.split("\n").filter(Boolean), clubs: s.clubs })
      .then(setExportData).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.items.length, s.storeId, notes, offline]);

  const finish = async () => {
    setBusy(true);
    try {
      setDone(await api.checkout({
        target_budget: s.budget, store_id: s.storeId, clubs: s.clubs,
        locked: s.lockedPayload(), include_delivery_in_budget: s.includeDelivery,
      }));
    } catch { /* offline - the checklist still works */ } finally { setBusy(false); }
  };

  if (!s.items.length) {
    return (
      <main className="space-y-3 p-4 pt-10 text-center">
        <p className="text-lg font-semibold">אין רשימה עדיין</p>
        <Link href="/" className="btn-primary inline-flex">בנה סל</Link>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold">רשימת קנייה</h1>
        <p className="text-sm text-ink-muted">
          {s.items.length} פריטים · {ilsShort(total)} · סומנו {checked}/{s.items.length}
        </p>
      </header>

      <div className={`flex items-center gap-2 rounded-xl p-2.5 text-xs ${
        offline ? "bg-amber-50 text-amber-800" : "bg-brand/10 text-brand-dark"}`}>
        {offline ? <WifiOff size={14} /> : <Check size={14} />}
        {offline
          ? "אין חיבור - הרשימה נשמרה במכשיר והסימון ממשיך לעבוד"
          : "הרשימה נשמרת מקומית ותעבוד גם בלי קליטה בסניף"}
      </div>

      <div className="space-y-1.5">
        {s.items.map((i) => (
          <button key={i.gtin} onClick={() => s.toggleChecked(i.gtin)}
            className={`card flex w-full items-center gap-3 p-3 text-right transition-all ${i.checked ? "opacity-50" : ""}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
              i.checked ? "border-brand bg-brand text-white" : "border-slate-300"}`}>
              {i.checked && <Check size={14} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-medium ${i.checked ? "line-through" : ""}`}>
                {i.name}{i.qty > 1 && ` × ${i.qty}`}
              </span>
              <span className="block text-[11px] text-ink-muted">
                אם חסר: {SUBSTITUTE_LABELS[i.substitute_policy || "brand_alternative"]}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold">{ils(i.line_total)}</span>
          </button>
        ))}
      </div>

      <div className="card p-4">
        <p className="mb-2 text-sm font-semibold">הערות למלקט</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand" />
      </div>

      {exportData && (
        <div className="space-y-2">
          <a href={exportData.whatsapp_url} target="_blank" rel="noreferrer" className="btn-primary w-full">
            <MessageCircle size={18} />שלח רשימה בוואטסאפ
          </a>
          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              <ExternalLink size={14} className="ml-1 inline" />קישורים ישירים לאתר הרשת ({exportData.deep_links.length})
            </summary>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {exportData.deep_links.map((l: any) => (
                <a key={l.gtin} href={l.url} target="_blank" rel="noreferrer"
                   className="block truncate rounded-lg px-2 py-1.5 text-xs text-brand-dark hover:bg-slate-50">
                  {l.name} {l.qty > 1 && `× ${l.qty}`}
                </a>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-slate-50 p-2 text-[11px] text-ink-muted">
              <Chrome size={13} />עם תוסף הכרום של CartFit כל הסל נטען לעגלה באתר בלחיצה אחת
            </p>
          </details>
        </div>
      )}

      <button onClick={finish} disabled={busy} className="btn-ghost w-full">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        סיימתי לקנות - עדכן חיסכון ומזווה
      </button>

      {done && (
        <div className="space-y-3">
          <div className="card bg-brand/5 p-4">
            <p className="text-sm font-semibold text-brand-dark">{done.savings.headline_he}</p>
          </div>
          <div className="card p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Utensils size={15} className="text-accent" />מה מכינים ממה שנשאר
            </p>
            <div className="space-y-2">
              {done.leftover_ideas.map((idea: any) => (
                <div key={idea.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold">{idea.title} · {idea.time_min} דק'</p>
                  <p className="text-[11px] text-ink-muted">{idea.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <Link href="/insights" className="btn-primary w-full">לדשבורד החיסכון</Link>
        </div>
      )}
    </main>
  );
}
