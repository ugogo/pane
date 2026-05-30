import { useEffect, useState } from "react";
import { getAccentPopupEnabled, setAccentPopupEnabled } from "../../lib/commands";

type ProbeStatus = "idle" | "pass" | "warn" | "fail";

const statusStyles: Record<ProbeStatus, string> = {
  idle: "bg-neutral-100 text-neutral-600",
  pass: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  fail: "bg-rose-100 text-rose-800",
};

export function AccentCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void getAccentPopupEnabled()
      .then(setEnabled)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  async function handleToggle(next: boolean) {
    setError(undefined);
    const prev = enabled;
    setEnabled(next);
    try {
      await setAccentPopupEnabled(next);
    } catch (err) {
      setEnabled(prev ?? null);
      setError(String(err));
    }
  }

  const status: ProbeStatus = error ? "fail" : enabled === null ? "idle" : "pass";

  return (
    <div className="rounded-lg border border-line bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Accent popup</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Hold a letter (a, e, c, …) to pick an accented variant — à â é ç ô …
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}>
          {status}
        </span>
      </div>

      <div className="rounded-md border border-line p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Enable long-press accents</p>
            <p className="text-xs text-neutral-500">
              Works in text fields, Chromium/Electron apps, and terminals. Pick a
              variant with a click or its number key; Esc dismisses.
            </p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-accent"
            disabled={enabled === null}
            checked={enabled ?? false}
            onChange={(e) => void handleToggle(e.target.checked)}
          />
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
