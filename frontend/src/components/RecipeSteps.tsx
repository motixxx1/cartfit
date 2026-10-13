"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Lightbulb, Play, Pause, RotateCcw } from "lucide-react";

export default function RecipeSteps({ steps, totalTime }: { steps: any[]; totalTime: number }) {
  const [done, setDone] = useState<number[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s <= 1 ? (setRunning(false), 0) : s - 1)), 1000);
    return () => clearInterval(t);
  }, [running, secondsLeft]);

  const startTimer = (step: any) => {
    setActive(step.order);
    setSecondsLeft(step.duration_min * 60);
    setRunning(true);
  };
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between p-4">
        <span className="text-sm text-ink-soft">
          זמן הכנה כולל: <b className="text-ink">{totalTime} דקות</b>
        </span>
        <span className="text-sm text-ink-soft">{done.length}/{steps.length} שלבים</span>
      </div>

      {steps.map((s) => {
        const isDone = done.includes(s.order);
        const isActive = active === s.order;
        return (
          <div key={s.order} className={`card p-4 transition-all ${isDone ? "opacity-60" : ""} ${isActive ? "ring-2 ring-brand/40" : ""}`}>
            <div className="flex items-start gap-3">
              <button
                onClick={() => setDone((d) => (isDone ? d.filter((x) => x !== s.order) : [...d, s.order]))}
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  isDone ? "border-brand bg-brand text-white" : "border-slate-300 text-ink-muted"}`}>
                {isDone ? <Check size={14} /> : s.order}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className={`text-sm font-bold ${isDone ? "line-through" : ""}`}>{s.title}</h4>
                  <span className="flex items-center gap-1 text-[11px] text-ink-muted"><Clock size={12} />{s.duration_min} דק'</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.desc}</p>
                {s.tip && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-accent-light/60 p-2 text-[12px] text-amber-900">
                    <Lightbulb size={13} className="mt-0.5 shrink-0" />{s.tip}
                  </p>
                )}

                {isActive ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-brand-dark">{mmss(secondsLeft)}</span>
                    <button onClick={() => setRunning((r) => !r)} className="chip chip-off !py-1">
                      {running ? <Pause size={13} /> : <Play size={13} />}{running ? "השהה" : "המשך"}
                    </button>
                    <button onClick={() => { setActive(null); setRunning(false); }} className="chip chip-off !py-1">
                      <RotateCcw size={13} />איפוס
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startTimer(s)} className="mt-2 chip chip-off !py-1 !text-[11px]">
                    <Play size={12} />הפעל טיימר
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
