"use client";

import { CATEGORY_COLORS } from "@/lib/format";
import { ils } from "@/lib/format";

/** Lightweight SVG donut - spending share per category. */
export default function CategoryDonut({ data, total, title = "התפלגות הסל" }: {
  data: { category: string; label_he: string; total: number; pct: number }[];
  total: number; title?: string;
}) {
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="card p-4">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0 -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#F1F5F9" strokeWidth="18" />
          {data.map((d) => {
            const len = (d.pct / 100) * C;
            const el = (
              <circle key={d.category} cx="70" cy="70" r={R} fill="none"
                      stroke={CATEGORY_COLORS[d.category] || "#94A3B8"} strokeWidth="18"
                      strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </svg>

        <div className="min-w-0 flex-1 space-y-1.5">
          {data.map((d) => (
            <div key={d.category} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 truncate">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[d.category] }} />
                {d.label_he}
              </span>
              <span className="shrink-0 text-ink-muted">{d.pct}% · {ils(d.total)}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-slate-100 pt-1.5 text-xs font-semibold">
            סה"כ {ils(total)}
          </div>
        </div>
      </div>
    </div>
  );
}
