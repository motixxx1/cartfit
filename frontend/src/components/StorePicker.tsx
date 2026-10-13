"use client";

import { Truck, AlertTriangle } from "lucide-react";
import { ilsShort } from "@/lib/format";
import type { Store } from "@/lib/types";

export default function StorePicker({
  stores, value, onChange, budget,
}: { stores: Store[]; value: string; onChange: (id: string) => void; budget?: number }) {
  const selected = stores.find((s) => s.id === value);
  const belowMin = !!(selected && budget && budget < selected.min_online_order);

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">רשת</span>
        <span className="text-xs text-ink-muted">המחירים מתעדכנים מקבצי חוק המזון</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {stores.map((s) => {
          const on = s.id === value;
          return (
            <button key={s.id} onClick={() => onChange(s.id)}
              className={`flex min-w-[112px] flex-col items-start gap-1 rounded-2xl border p-3 text-right transition-all ${
                on ? "border-brand bg-brand/5 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <span className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg text-center text-xs font-bold leading-7 text-white"
                      style={{ background: s.color }}>{s.short.slice(0, 2)}</span>
                <span className={`text-sm font-semibold ${on ? "text-brand-dark" : "text-ink"}`}>{s.short}</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                <Truck size={12} /> משלוח {ilsShort(s.delivery_fee)}
              </span>
              <span className="text-[11px] text-ink-muted">מינימום {ilsShort(s.min_online_order)}</span>
            </button>
          );
        })}
      </div>

      {belowMin && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-accent-light p-3 text-xs text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            מינימום להזמנה ב{selected!.name} הוא {ilsShort(selected!.min_online_order)} - בתקציב הזה עדיף
            איסוף עצמי או קנייה בסניף.
          </span>
        </div>
      )}
    </div>
  );
}
