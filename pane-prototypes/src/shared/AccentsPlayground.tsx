import { useRef, useState } from 'react';
import { usePane } from '../mock/store';
import './accents.css';

// Interactive long-press-for-diacritics demo. Holding a mapped letter (which
// fires keydown `repeat` events) opens a variant chooser; press 1..n to pick.
// Deliberately self-contained + themeable via `className` + CSS vars.
export function AccentsPlayground({
  className,
  accent = '#7c5cff',
  placeholder = 'Type here, then hold a vowel — e.g. hold “a”…',
}: {
  className?: string;
  accent?: string;
  placeholder?: string;
}) {
  const { accents } = usePane();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [chooser, setChooser] = useState<{ base: string; variants: string[]; at: number } | null>(
    null,
  );

  const pickVariant = (variant: string) => {
    const el = ref.current;
    if (!el || !chooser) return;
    const v = el.value;
    el.value = v.slice(0, chooser.at) + variant + v.slice(chooser.at + 1);
    const caret = chooser.at + variant.length;
    el.setSelectionRange(caret, caret);
    setChooser(null);
    el.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (chooser) {
      const n = Number(e.key);
      if (n >= 1 && n <= chooser.variants.length) {
        e.preventDefault();
        pickVariant(chooser.variants[n - 1]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setChooser(null);
        return;
      }
    }
    if (!accents.enabled) return;
    const base = e.key.toLowerCase();
    const variants = accents.map[base];
    if (e.repeat && variants && !chooser) {
      e.preventDefault();
      const el = e.currentTarget;
      // the held base char was inserted at caret-1
      setChooser({ base, variants, at: Math.max(0, el.selectionStart - 1) });
    }
  };

  return (
    <div className={className} style={{ position: 'relative', ['--accent' as string]: accent }}>
      <textarea
        ref={ref}
        className="accents-input"
        rows={3}
        placeholder={accents.enabled ? placeholder : 'Accents helper is disabled'}
        disabled={!accents.enabled}
        onKeyDown={onKeyDown}
        onBlur={() => setChooser(null)}
      />
      {chooser && (
        <div className="accents-chooser" role="listbox" aria-label="Accent variants">
          {chooser.variants.map((v, i) => (
            <button
              key={v}
              className="accents-chooser__item"
              onMouseDown={(e) => {
                e.preventDefault();
                pickVariant(v);
              }}
            >
              <span className="accents-chooser__glyph">{v}</span>
              <span className="accents-chooser__num">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
