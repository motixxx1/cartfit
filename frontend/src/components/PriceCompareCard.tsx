"use client";

import { Crown, Truck, AlertTriangle } from "lucide-react";
import { ils } from "@/lib/format";

export default function PriceCompareCard({ rows, onPick, currentStoreId }: {
  rows: any[]; onPick?: (storeId: string) => void; currentStoreId?: string;
}) {
  const max = Math.max(...rows.map((r) => r.grand_total), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const width = Math.round((r.grand_total / max) * 100);
        return (
          <button key={r.store_id} onClick={() => onPick?.(r.store_id)}
            className={`card w-full p-3 text-right transition-all ${r.is_best ? "ring-2 ring-brand/50" : ""} ${
              currentStoreId === r.store_id ? "bg-slate-50" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg text-center text-[11px] font-bold leading-7 text-white"
                      style={{ background: r.color }}>{r.store_name.slice(0, 2)}</span>
                <span className="text-sm font-semibold">{r.store_name}</span>
                {r.is_best && (
                  <span className="tag bg-brand/10 text-brand-dark"><Crown size={11} />הכי זול</span>
                )}
              </span>
              <span className="text-left">
                <span className="block text-base font-bold">{ils(r.grand_total)}</span>
                {r.diff_from_best > 0 && (
                  <span className="block text-[11px] text-red-500">+{ils(r.diff_from_best)}</span>
                )}
              </span>
            </div>

            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${width}%`, background: r.is_best ? "#10B981" : "#CBD5E1" }} />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
              <span>מוצרים {ils(r.items_total)}</span>
              {r.delivery_fee > 0 && <span className="flex items-center gap-1"><Truck size={11} />{ils(r.delivery_fee)}</span>}
              {r.promo_savings > 0 && <span className="text-brand-dark">מבצעים: {ils(r.promo_savings)}-</span>}
              {r.missing_items > 0 && <span className="text-amber-600">{r.missing_items} פריטים חסרים</span>}
              {!r.meets_minimum && (
                <span className="flex items-center gap-1 text-amber-600"><AlertTriangle size={11} />מתחת למינימום הזמנה</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
