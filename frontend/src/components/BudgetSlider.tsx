"use client";

import { ilsShort } from "@/lib/format";

const QUICK = [150, 300, 500, 800];

export default function BudgetSlider({
  value, onChange, min = 50, max = 1500,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="card p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-ink-muted">תקציב יעד</span>
        <span className="text-xs text-ink-muted">{ilsShort(min)} – {ilsShort(max)}</span>
      </div>

      <div className="mb-4 flex items-end gap-2">
        <span className="text-5xl font-extrabold tracking-tight text-ink">{ilsShort(value)}</span>
        <span className="pb-2 text-sm text-ink-muted">לסל אחד</span>
      </div>

      <input
        type="range" className="budget" min={min} max={max} step={10} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to left, #10B981 ${pct}%, #E2E8F0 ${pct}%)` }}
        aria-label="בחירת תקציב"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q} onClick={() => onChange(q)}
            className={`chip ${value === q ? "chip-on" : "chip-off"}`}>{ilsShort(q)}</button>
        ))}
      </div>
    </div>
  );
}
