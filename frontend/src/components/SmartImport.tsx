"use client";

import { useState } from "react";
import { Receipt, Link2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { ils } from "@/lib/format";
import type { CartItem } from "@/lib/types";

/** Receipt OCR text -> cart, and recipe text/URL -> cart (Phase 7). */
export default function SmartImport({ storeId, onItems }: {
  storeId: string; onItems: (items: CartItem[], note: string) => void;
}) {
  const [tab, setTab] = useState<"receipt" | "recipe">("receipt");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = tab === "receipt"
        ? await api.receipt({ text, store_id: storeId })
        : await api.importRecipe({ text: text || undefined, url: url || undefined, store_id: storeId, servings: 4 });
      setResult(res);
      onItems(res.items, tab === "receipt" ? "מקבלה" : "ממתכון");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab("receipt")} className={`chip ${tab === "receipt" ? "chip-on" : "chip-off"}`}>
          <Receipt size={13} />קבלה ישנה
        </button>
        <button onClick={() => setTab("recipe")} className={`chip ${tab === "recipe" ? "chip-on" : "chip-off"}`}>
          <Link2 size={13} />מתכון / קישור
        </button>
      </div>

      {tab === "recipe" && (
        <input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr"
               placeholder="https://... קישור למתכון"
               className="mb-2 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-brand" />
      )}

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
        placeholder={tab === "receipt"
          ? "הדבק כאן את טקסט הקבלה (או את תוצאת ה-OCR מהצילום)"
          : "או הדבק את רשימת המצרכים מהמתכון"}
        className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand" />

      <button onClick={run} disabled={busy || (!text && !url)} className="btn-primary mt-2 w-full disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        {tab === "receipt" ? "המר לסל" : "הכנס לסל"}
      </button>

      {error && <p className="mt-2 rounded-xl bg-red-50 p-2 text-xs text-red-600">{error}</p>}

      {result && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
          <p className="font-semibold">{result.items.length} מוצרים זוהו · {ils(result.total)}</p>
          {result.message_he && <p className="mt-1 text-brand-dark">{result.message_he}</p>}
          {result.unmatched_lines?.length > 0 && (
            <p className="mt-1 text-ink-muted">לא זוהו: {result.unmatched_lines.join(" · ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
