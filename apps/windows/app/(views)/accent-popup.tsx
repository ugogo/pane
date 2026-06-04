import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLocalSearchParams } from 'expo-router';
import { accentSelect } from '@/lib/commands';

interface AccentPayload {
  accents: string[];
}

export default function AccentPopupPage() {
  const { chars } = useLocalSearchParams<{ chars?: string }>();
  const [accents, setAccents] = useState<string[]>(() =>
    chars ? chars.split(',').filter(Boolean) : [],
  );
  // Index highlighted for keyboard navigation; driven by the Rust hook, which
  // owns the keyboard while the popup is up.
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    // Clear inherited app backgrounds so this overlay window is transparent.
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    const unlisten = listen<AccentPayload>('show-accent-popup', (e) => {
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
    <div className="border-border bg-card text-card-foreground fixed inset-0 flex gap-1 rounded-lg border p-1.5 shadow-lg">
      {accents.map((ch, i) => (
        <button
          key={ch}
          type="button"
          aria-label={`Select ${ch}, shortcut ${i + 1}`}
          aria-current={i === selected ? 'true' : undefined}
          onClick={() => void accentSelect(ch)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md transition-colors ${
            i === selected
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
          }`}
        >
          <span className="text-lg leading-none">{ch}</span>
          <span
            className={`text-[9px] leading-none ${
              i === selected
                ? 'text-primary-foreground/75'
                : 'text-muted-foreground/60'
            }`}
          >
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  );
}
