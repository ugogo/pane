import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { accentSelect, accentDismiss } from "../lib/commands";

interface AccentPayload {
  accents: string[];
}

export function AccentPopup() {
  const [accents, setAccents] = useState<string[]>([]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    const unlisten = listen<AccentPayload>("show-accent-popup", (e) => {
      setAccents(e.payload.accents);
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  useEffect(() => {
    function onBlur() {
      void accentDismiss();
    }
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        void accentDismiss();
        return;
      }
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= accents.length) {
        void accentSelect(accents[n - 1]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [accents]);

  if (accents.length === 0) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-transparent">
      <div className="flex gap-1 rounded-xl bg-slate-800 px-2 py-2 shadow-2xl ring-1 ring-white/10">
        {accents.map((ch, i) => (
          <button
            key={ch}
            type="button"
            onClick={() => void accentSelect(ch)}
            className="flex w-10 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-slate-100 transition-colors hover:bg-slate-600 active:bg-slate-500"
          >
            <span className="text-base leading-none">{ch}</span>
            <span className="text-[9px] leading-none text-slate-500">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
