import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Text } from 'pickle-ui';
import { accentPopupReady, accentSelect } from '@/lib/commands';

interface AccentPayload {
  accents: string[];
}

interface AccentPopupSearch {
  chars?: string;
}

type AccentPopupWindow = Window & {
  __accentSel?: (i: number) => void;
  __accentShow?: (accents: string[]) => void;
};

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
    const popupWindow = window as AccentPopupWindow;
    popupWindow.__accentSel = (i: number) => setSelected(i);
    popupWindow.__accentShow = (nextAccents: string[]) => {
      setAccents(nextAccents);
      setSelected(0);
    };
    void accentPopupReady();
    return () => {
      delete popupWindow.__accentSel;
      delete popupWindow.__accentShow;
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
            <Button
              key={ch}
              type="button"
              variant={active ? 'primary' : 'ghost'}
              aria-label={`Select ${ch}, shortcut ${i + 1}`}
              aria-current={active ? 'true' : undefined}
              className="flex-1 flex-col"
              onClick={() => void accentSelect(ch)}
            >
              <Text as="span" variant="h3">
                {ch}
              </Text>
              <Text as="span" tone="muted" variant="small">
                {i + 1}
              </Text>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
