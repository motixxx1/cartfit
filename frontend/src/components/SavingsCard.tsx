"use client";

import { TrendingDown, TrendingUp, PiggyBank } from "lucide-react";
import { ils, ilsShort } from "@/lib/format";

export default function SavingsCard({ summary }: { summary: any }) {
  if (!summary) return null;
  const inflation = summary.personal_inflation_pct;
  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-l from-brand to-emerald-600 p-5 text-white">
        <p className="flex items-center gap-2 text-sm opacity-90"><PiggyBank size={16} />החיסכון שלך החודש</p>
        <p className="mt-1 text-4xl font-extrabold">{ilsShort(summary.total_saved)}</p>
        <p className="mt-1 text-xs opacity-90">{summary.headline_he}</p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 text-center">
        <div className="p-3">
          <p className="text-[11px] text-ink-muted">ממבצעים</p>
          <p className="text-sm font-bold">{ils(summary.promo_saved)}</p>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-ink-muted">מבחירת רשת</p>
          <p className="text-sm font-bold">{ils(summary.store_switch_saved)}</p>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-ink-muted">סלים</p>
          <p className="text-sm font-bold">{summary.baskets}</p>
        </div>
      </div>
      {inflation !== null && inflation !== undefined && (
        <div className="flex items-center gap-2 border-t border-slate-100 p-3 text-xs">
          {inflation >= 0 ? <TrendingUp size={14} className="text-red-500" /> : <TrendingDown size={14} className="text-brand" />}
          <span className="text-ink-soft">
            מדד האינפלציה האישי שלך: <b className={inflation >= 0 ? "text-red-500" : "text-brand-dark"}>
              {inflation > 0 ? "+" : ""}{inflation}%
            </b> בסל הקבוע שלך
          </span>
        </div>
      )}
    </div>
  );
}
