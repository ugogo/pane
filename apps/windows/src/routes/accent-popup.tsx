import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { createFileRoute } from '@tanstack/react-router';
import { accentSelect } from '@/lib/commands';

interface AccentPayload {
  accents: string[];
}

interface AccentPopupSearch {
  chars?: string;
}

export const Route = createFileRoute('/accent-popup')({
  validateSearch: (search): AccentPopupSearch => ({
    chars: typeof search.chars === 'string' ? search.chars : undefined,
  }),
  component: AccentPopupPage,
});

function AccentPopupPage() {
  const { chars } = Route.useSearch();
  const [accents, setAccents] = useState<string[]>(() =>
    chars ? chars.split(',').filter(Boolean) : [],
  );
  const [selected, setSelected] = useState(0);

  useEffect(() => {
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
    <div
      key={accents.join(',')}
      style={{
        display: 'block',
        height: '100%',
        inset: 0,
        position: 'fixed',
        width: '100%',
      }}
    >
      <div className="absolute inset-0 flex gap-1 bg-muted p-1 shadow-[0_8px_24px_var(--app-shadow-strong)]">
        {accents.map((ch, i) => {
          const active = i === selected;
          return (
            <button
              key={ch}
              type="button"
              aria-label={`Select ${ch}, shortcut ${i + 1}`}
              aria-current={active ? 'true' : undefined}
              className={
                active
                  ? 'flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-0 bg-primary text-primary-foreground hover:bg-primary'
                  : 'flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-0 bg-transparent text-muted-foreground hover:bg-[var(--app-white-08)] hover:text-foreground'
              }
              onClick={() => void accentSelect(ch)}
            >
              <span className="text-lg leading-none text-current">{ch}</span>
              <span
                className={`text-[9px] leading-none text-current ${active ? 'opacity-80' : 'opacity-60'}`}
              >
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
