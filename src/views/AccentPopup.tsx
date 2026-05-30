import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { accentSelect } from "../lib/commands";

interface AccentPayload {
  accents: string[];
}

function accentsFromUrl(): string[] {
  const chars = new URLSearchParams(window.location.search).get("chars");
  return chars ? chars.split(",").filter(Boolean) : [];
}

export function AccentPopup() {
  const [accents, setAccents] = useState<string[]>(accentsFromUrl);
  // Index highlighted for keyboard navigation; driven by the Rust hook, which
  // owns the keyboard while the popup is up.
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    // The global stylesheet paints #root opaque (#f5f5f4); clear it (and its
    // ancestors) so this overlay window is genuinely transparent.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
  }, []);

  useEffect(() => {
    const unlisten = listen<AccentPayload>("show-accent-popup", (e) => {
      setAccents(e.payload.accents);
      setSelected(0);
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  useEffect(() => {
    // The Rust keyboard hook owns navigation and pushes the highlighted index
    // here via `eval` (the popup is never focused, so events are throttled).
    (window as Window & { __accentSel?: (i: number) => void }).__accentSel = (
      i: number,
    ) => setSelected(i);
    return () => {
      delete (window as Window & { __accentSel?: (i: number) => void })
        .__accentSel;
    };
  }, []);

  if (accents.length === 0) return null;

  return (
    <div className="fixed inset-0 flex gap-1 bg-slate-800 p-1.5 shadow-2xl ring-1 ring-white/10">
      {accents.map((ch, i) => (
        <button
          key={ch}
          type="button"
          onClick={() => void accentSelect(ch)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md transition-colors ${
            i === selected
              ? "bg-slate-600 text-white"
              : "text-slate-100 hover:bg-slate-700"
          }`}
        >
          <span className="text-lg leading-none">{ch}</span>
          <span
            className={`text-[9px] leading-none ${
              i === selected ? "text-slate-300" : "text-slate-500"
            }`}
          >
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  );
}
