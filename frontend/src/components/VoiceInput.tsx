"use client";

import { useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";

/** Web Speech API (he-IL) -> free text -> parsed by /api/smart/voice */
export default function VoiceInput({ onTranscript, busy }: {
  onTranscript: (text: string) => void; busy?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const recRef = useRef<any>(null);

  const toggle = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setUnsupported(true); return; }
    const rec = new SR();
    rec.lang = "he-IL";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      setHeard(text);
      if (e.results[e.results.length - 1].isFinal) { onTranscript(text); setListening(false); }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <button onClick={toggle} disabled={busy}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all ${
            listening ? "animate-pulse bg-red-500 text-white" : "bg-brand text-white"}`}>
          {busy ? <Loader2 size={20} className="animate-spin" /> : listening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">בנה סל בדיבור</p>
          <p className="truncate text-[11px] text-ink-muted">
            {heard || unsupported
              ? heard || "הדפדפן לא תומך בזיהוי דיבור - נסה בכרום"
              : "״תרכיב לי סל לשישי ב-400 שקל כולל עוף, חלות ושתייה״"}
          </p>
        </div>
      </div>
    </div>
  );
}
