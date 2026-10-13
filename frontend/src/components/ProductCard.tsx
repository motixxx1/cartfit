"use client";

import { useState } from "react";
import { Lock, Unlock, RefreshCw, Trash2, Star, Plus, Minus, AlertTriangle, Megaphone, Tag } from "lucide-react";
import { ils, packLabel, SUBSTITUTE_LABELS, CATEGORY_COLORS } from "@/lib/format";
import type { CartItem, SubstitutePolicy } from "@/lib/types";

export default function ProductCard({
  item, onLock, onSwap, onRemove, onQty, onWatch, onPolicy, watched, compact,
}: {
  item: CartItem;
  onLock?: () => void; onSwap?: () => void; onRemove?: () => void;
  onQty?: (q: number) => void; onWatch?: () => void;
  onPolicy?: (p: SubstitutePolicy) => void;
  watched?: boolean; compact?: boolean;
}) {
  const [openPolicy, setOpenPolicy] = useState(false);

  return (
    <div className={`card animate-pop p-3 ${item.locked ? "ring-1 ring-brand/40" : ""}`}>
      <div className="flex gap-3">
        <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
              style={{ background: CATEGORY_COLORS[item.category] }} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
              <p className="text-[11px] text-ink-muted">
                {item.brand} · {packLabel(item.pack_size, item.pack_unit)}
                {item.qty > 1 && ` · ${item.qty} יח'`}
              </p>
            </div>
            <div className="shrink-0 text-left">
              <p className="text-sm font-bold text-ink">{ils(item.line_total)}</p>
              {item.saved > 0 && (
                <p className="text-[11px] text-ink-muted line-through">{ils(item.list_price * item.qty)}</p>
              )}
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.is_on_promo && (
              <span className="tag bg-accent-light text-amber-800">
                <Tag size={11} />{item.promo_description}{item.is_club_promo && " · מועדון"}
              </span>
            )}
            {item.bundle_description && (
              <span className="tag bg-indigo-50 text-indigo-700">מארז: {item.bundle_description}</span>
            )}
            {item.is_sponsored && (
              <span className="tag bg-slate-100 text-ink-muted"><Megaphone size={11} />ממומן</span>
            )}
            {item.warning_labels?.map((w) => (
              <span key={w.code} className="tag bg-red-50 text-red-700">
                <AlertTriangle size={11} />{w.label_he}
              </span>
            ))}
          </div>

          {item.bundle_hint && (
            <p className="mt-1.5 rounded-lg bg-indigo-50/70 px-2 py-1 text-[11px] text-indigo-700">
              💡 {item.bundle_hint}
            </p>
          )}
          {item.note && <p className="mt-1 text-[11px] text-ink-muted">{item.note}</p>}

          {!compact && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {onQty && (
                <span className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
                  <button onClick={() => onQty(item.qty - 1)} className="rounded-md p-1 hover:bg-slate-100" aria-label="הפחת">
                    <Minus size={13} />
                  </button>
                  <span className="min-w-5 text-center text-xs font-semibold">{item.qty}</span>
                  <button onClick={() => onQty(item.qty + 1)} className="rounded-md p-1 hover:bg-slate-100" aria-label="הוסף">
                    <Plus size={13} />
                  </button>
                </span>
              )}
              {onLock && (
                <button onClick={onLock}
                  className={`chip ${item.locked ? "chip-on" : "chip-off"} !px-2 !py-1 !text-[11px]`}>
                  {item.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  {item.locked ? "נעול" : "נעל"}
                </button>
              )}
              {onSwap && (
                <button onClick={onSwap} className="chip chip-off !px-2 !py-1 !text-[11px]">
                  <RefreshCw size={12} />החלף
                </button>
              )}
              {onWatch && (
                <button onClick={onWatch}
                  className={`chip !px-2 !py-1 !text-[11px] ${watched ? "chip-on" : "chip-off"}`}>
                  <Star size={12} fill={watched ? "currentColor" : "none"} />מעקב
                </button>
              )}
              {onPolicy && (
                <button onClick={() => setOpenPolicy((v) => !v)} className="chip chip-off !px-2 !py-1 !text-[11px]">
                  אם חסר: {SUBSTITUTE_LABELS[item.substitute_policy || "brand_alternative"]}
                </button>
              )}
              {onRemove && (
                <button onClick={onRemove} className="mr-auto rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        aria-label="הסר">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}

          {openPolicy && onPolicy && (
            <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl bg-slate-50 p-2">
              {(Object.keys(SUBSTITUTE_LABELS) as SubstitutePolicy[]).map((p) => (
                <button key={p}
                  onClick={() => { onPolicy(p); setOpenPolicy(false); }}
                  className={`chip !py-1 !text-[11px] ${
                    (item.substitute_policy || "brand_alternative") === p ? "chip-on" : "chip-off"}`}>
                  {SUBSTITUTE_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
