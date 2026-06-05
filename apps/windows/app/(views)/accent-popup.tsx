import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLocalSearchParams } from 'expo-router';
import { PopupTransition, Text } from '@pane/ui';
import { accentSelect } from '@/lib/commands';

interface AccentPayload {
  accents: string[];
}

export default function AccentPopupPage() {
  const { chars } = useLocalSearchParams<{ chars?: string }>();
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
              <Text fontSize="$6" lineHeight={1}>
                {ch}
              </Text>
              <Text fontSize={9} lineHeight={1} opacity={active ? 0.75 : 0.6}>
                {i + 1}
              </Text>
            </button>
          );
        })}
      </div>
    </PopupTransition>
  );
}
