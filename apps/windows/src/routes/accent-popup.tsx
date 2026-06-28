import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { createFileRoute } from '@tanstack/react-router';
import { PopupTransition } from '@pane/ui';
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
    <PopupTransition
      motionKey={accents.join(',')}
      style={{
        display: 'block',
        height: '100%',
        inset: 0,
        position: 'fixed',
        width: '100%',
      }}
    >
      <div className="accent-popup-root">
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
                  ? 'accent-popup-chip accent-popup-chip-active'
                  : 'accent-popup-chip'
              }
              onClick={() => void accentSelect(ch)}
            >
              <span className="accent-popup-char">{ch}</span>
              <span className="accent-popup-shortcut">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </PopupTransition>
  );
}
