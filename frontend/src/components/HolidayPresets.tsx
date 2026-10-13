"use client";

export default function HolidayPresets({ presets, value, onPick }: {
  presets: any[]; value: string | null; onPick: (id: string | null, budget?: number) => void;
}) {
  return (
    <div className="card p-4">
      <p className="mb-1 text-sm font-semibold">מצב חג ואירוע</p>
      <p className="mb-3 text-[11px] text-ink-muted">הסל מותאם אוטומטית לתפריט ולמוצרים של האירוע</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => onPick(null)}
          className={`chip shrink-0 ${value === null ? "chip-on" : "chip-off"}`}>רגיל</button>
        {presets.map((p) => (
          <button key={p.id} onClick={() => onPick(p.id, p.suggested_budget)}
            className={`chip shrink-0 ${value === p.id ? "chip-on" : "chip-off"}`}>
            <span>{p.emoji}</span>{p.title}
          </button>
        ))}
      </div>
      {value && (
        <p className="mt-2 rounded-xl bg-brand/5 p-2 text-[11px] text-brand-dark">
          {presets.find((p) => p.id === value)?.note}
        </p>
      )}
    </div>
  );
}
