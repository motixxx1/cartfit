"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Shuffle, ScanLine, Share2, Loader2, Scale, Check } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import CategoryDonut from "@/components/CategoryDonut";
import BarcodeScanner from "@/components/BarcodeScanner";
import SmartImport from "@/components/SmartImport";
import { api } from "@/lib/api";
import { ils, ilsShort } from "@/lib/format";
import { useCartStore } from "@/store/useCartStore";

function CartContent() {
  const s = useCartStore();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [watched, setWatched] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const total = s.total();
  const remaining = +(s.budget - total).toFixed(2);
  const pct = Math.min(100, Math.round((total / s.budget) * 100));

  // Shared household cart: /cart?share=XYZ
  useEffect(() => {
    const code = params.get("share");
    if (!code) return;
    api.loadShare(code).then((d) => {
      const payload = d.payload;
      if (payload?.items?.length) {
        s.setBasket({ ...(s.basket as any), items: payload.items, store_id: payload.store_id || s.storeId } as any);
        s.setShareCode(code);
        setToast(`נטען סל משותף ${code}`);
      }
    }).catch(() => setToast("קוד שיתוף לא נמצא"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { api.watchlist().then((d) => setWatched(d.items.map((i: any) => i.gtin))).catch(() => {}); }, []);

  const regenerate = async () => {
    setBusy(true);
    try {
      s.bumpSeed();
      const basket = await api.shuffleBasket({
        target_budget: s.budget, store_id: s.storeId, category_focus: s.focus, clubs: s.clubs,
        healthy_only: s.healthyOnly, include_delivery_in_budget: s.includeDelivery,
        holiday_id: s.holidayId, seed: s.seed + 1,
        locked: s.items.filter((i) => i.locked).map((i) => ({ gtin: i.gtin, qty: i.qty })),
      });
      s.setBasket(basket);
    } finally { setBusy(false); }
  };

  const swap = async (gtin: string) => {
    try {
      const next = await api.swap({
        gtin, store_id: s.storeId, clubs: s.clubs, direction: "equivalent",
        // without this the replacement can be a product already in the cart
        exclude: s.items.map((i) => i.gtin),
      });
      s.replaceItem(gtin, next);
    } catch (e: any) { setToast(e.message); }
  };

  const onScan = async (gtin: string) => {
    setScanOpen(false);
    try {
      const res = await api.scan({ gtin, store_id: s.storeId, clubs: s.clubs, current_total: total, target_budget: s.budget });
      setScanResult(res);
    } catch { setToast("סריקה נכשלה"); }
  };

  const share = async () => {
    const { code } = await api.share({ items: s.items, store_id: s.storeId, budget: s.budget });
    s.setShareCode(code);
    const url = `${location.origin}/cart?share=${code}`;
    // A WebView (the Android build) often refuses clipboard writes; the code
    // itself is the shareable part, so show it either way.
    try {
      await navigator.clipboard?.writeText(url);
      setToast(`הקישור הועתק · קוד ${code}`);
    } catch {
      setToast(`קוד הסל: ${code} · העתיקו אותו ידנית`);
    }
  };

  const toggleWatch = async (gtin: string) => {
    try {
      if (watched.includes(gtin)) { await api.unwatch(gtin); setWatched((w) => w.filter((g) => g !== gtin)); }
      else { await api.watch(gtin, "demo", s.isPro); setWatched((w) => [...w, gtin]); }
    } catch (e: any) { setToast(e.message); }
  };

  const breakdown = (() => {
    const map: Record<string, { category: string; label_he: string; total: number; pct: number }> = {};
    const labels: Record<string, string> = { fresh: "טרי", protein: "חלבון ובשר", pantry: "יבש ומזווה", snacks: "חטיפים ושתייה", extra: "נלווים ובית" };
    s.items.forEach((i) => {
      map[i.category] = map[i.category] || { category: i.category, label_he: labels[i.category], total: 0, pct: 0 };
      map[i.category].total = +(map[i.category].total + i.line_total).toFixed(2);
    });
    return Object.values(map).map((v) => ({ ...v, pct: total ? +((v.total / total) * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.total - a.total);
  })();

  if (!s.items.length) {
    return (
      <main className="space-y-4 p-4 pt-10 text-center">
        <p className="text-lg font-semibold">הסל ריק</p>
        <p className="text-sm text-ink-muted">בנה סל לפי תקציב או הרכב ארוחה במצב שף</p>
        <Link href="/" className="btn-primary inline-flex">חזרה לבית</Link>
      </main>
    );
  }

  return (
    <main className="pb-4">
      {/* sticky budget bar */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 p-4 backdrop-blur">
        <div className="flex items-baseline justify-between text-sm">
          <span>נוצל: <b className="text-base">{ilsShort(total)}</b> / {ilsShort(s.budget)}</span>
          <span className={remaining < 0 ? "text-red-500" : "text-brand-dark"}>
            {remaining < 0 ? `חריגה ${ilsShort(Math.abs(remaining))}` : `נותרו ${ilsShort(remaining)}`}
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full transition-all duration-500"
               style={{ width: `${pct}%`, background: remaining < 0 ? "#EF4444" : "#10B981" }} />
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={regenerate} disabled={busy} className="chip chip-off flex-1 justify-center">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />}ערבב מחדש
          </button>
          <button onClick={() => setScanOpen(true)} className="chip chip-off flex-1 justify-center">
            <ScanLine size={13} />סרוק מוצר
          </button>
          <button onClick={share} className="chip chip-off flex-1 justify-center">
            <Share2 size={13} />שתף סל
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {s.basket?.message_he && (
          <p className="rounded-xl bg-accent-light p-3 text-sm text-amber-900">{s.basket.message_he}</p>
        )}
        {toast && <p className="rounded-xl bg-brand/10 p-2.5 text-center text-xs text-brand-dark">{toast}</p>}

        {s.items.map((item) => (
          <ProductCard key={item.gtin} item={item} watched={watched.includes(item.gtin)}
            onLock={() => s.toggleLock(item.gtin)}
            onSwap={() => swap(item.gtin)}
            onRemove={() => s.removeItem(item.gtin)}
            onQty={(q) => s.setQty(item.gtin, q)}
            onWatch={() => toggleWatch(item.gtin)}
            onPolicy={(p) => s.setSubstitutePolicy(item.gtin, p)} />
        ))}

        <CategoryDonut data={breakdown} total={total} />

        <SmartImport storeId={s.storeId} onItems={(items, note) => {
          items.forEach((i) => s.addItem(i)); setToast(`נוספו ${items.length} מוצרים ${note}`);
        }} />

        <div className="grid grid-cols-2 gap-2">
          <Link href="/compare" className="btn-ghost"><Scale size={16} />השווה רשתות</Link>
          <Link href="/checkout" className="btn-primary"><Check size={16} />לרשימת הקנייה</Link>
        </div>
      </div>

      {scanOpen && <BarcodeScanner onDetected={onScan} onClose={() => setScanOpen(false)} />}

      {scanResult && (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/50 p-3" onClick={() => setScanResult(null)}>
          <div className="card w-full p-4" onClick={(e) => e.stopPropagation()}>
            {scanResult.found ? (
              <>
                <p className="text-sm font-bold">{scanResult.product.name}</p>
                <p className="mb-2 text-xs text-ink-muted">{scanResult.product.brand}</p>
                <div className="space-y-1">
                  {scanResult.prices.map((p: any) => (
                    <div key={p.store_id} className="flex justify-between text-sm">
                      <span className={p.is_best ? "font-semibold text-brand-dark" : ""}>{p.store_name}</span>
                      <span>{ils(p.items_total)}</span>
                    </div>
                  ))}
                </div>
                {scanResult.cheaper_elsewhere_he && (
                  <p className="mt-2 rounded-xl bg-accent-light p-2 text-xs text-amber-900">{scanResult.cheaper_elsewhere_he}</p>
                )}
                <p className={`mt-1 text-xs ${scanResult.fits_budget ? "text-brand-dark" : "text-red-500"}`}>
                  {scanResult.budget_message_he}
                </p>
                <button className="btn-primary mt-3 w-full"
                  onClick={() => {
                    const p = scanResult.product;
                    const price = scanResult.here?.items_total ?? p.prices[s.storeId];
                    s.addItem({ ...p, qty: 1, unit_price: price, list_price: p.prices[s.storeId],
                      line_total: price, saved: 0, is_on_promo: false, warning_labels: p.warning_labels || [] } as any);
                    setScanResult(null);
                  }}>הוסף לסל</button>
              </>
            ) : (
              <p className="text-sm">{scanResult.message_he}</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function CartPage() {
  return (
    <Suspense fallback={<main className="p-6 text-center text-sm text-ink-muted">טוען סל…</main>}>
      <CartContent />
    </Suspense>
  );
}
