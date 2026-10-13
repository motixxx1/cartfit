"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Keyboard } from "lucide-react";

/**
 * In-store scanner. Uses the native BarcodeDetector API where available
 * (Chrome/Android), and always offers manual entry as a fallback.
 */
export default function BarcodeScanner({ onDetected, onClose }: {
  onDetected: (gtin: string) => void; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    (async () => {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        setError("הדפדפן לא תומך בסריקה אוטומטית - אפשר להקליד את הברקוד");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "code_128"] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length) {
              onDetected(codes[0].rawValue);
              return;
            }
          } catch { /* frame not ready */ }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("אין גישה למצלמה - אפשר להקליד את הברקוד ידנית");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 p-4">
      <div className="flex items-center justify-between text-white">
        <span className="flex items-center gap-2 font-semibold"><Camera size={18} />סריקת ברקוד בסניף</span>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2"><X size={18} /></button>
      </div>

      <div className="relative mt-4 flex-1 overflow-hidden rounded-3xl bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-2 border-brand/80" />
        {scanning && (
          <span className="absolute bottom-4 inset-x-0 text-center text-xs text-white/80">
            כוון את הברקוד למסגרת
          </span>
        )}
      </div>

      {error && <p className="mt-3 rounded-xl bg-white/10 p-3 text-center text-sm text-white/90">{error}</p>}

      <div className="mt-3 flex gap-2">
        <span className="flex flex-1 items-center gap-2 rounded-xl bg-white px-3">
          <Keyboard size={16} className="text-ink-muted" />
          <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric"
                 placeholder="או הקלד ברקוד (13 ספרות)"
                 className="w-full bg-transparent py-3 text-sm outline-none" />
        </span>
        <button onClick={() => manual.trim() && onDetected(manual.trim())} className="btn-primary">בדוק</button>
      </div>
    </div>
  );
}
