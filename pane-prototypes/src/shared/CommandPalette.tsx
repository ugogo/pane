import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { buildCommands, type AreaKey, type Command } from '../mock/commands';
import { useActions, usePane } from '../mock/store';
import { fuzzyFilter } from './fuzzy';
import './palette.css';

const RECENTS_KEY = 'pane:palette-recents';

function loadRecents(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(RECENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  goto: (area: AreaKey) => void;
  startCapture: (mode: 'fullscreen' | 'area') => void;
  accent?: string;
  /** extra class for theming the surface per-prototype */
  surfaceClass?: string;
}

export function CommandPalette({
  open,
  onClose,
  goto,
  startCapture,
  accent = '#7c5cff',
  surfaceClass,
}: CommandPaletteProps) {
  const state = usePane();
  const actions = useActions();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(
    () => buildCommands({ state, actions, goto, startCapture }),
    [state, actions, goto, startCapture],
  );

  // Filter + group. With no query, show suggested + recent.
  const groups = useMemo(() => {
    if (!query.trim()) {
      const recentCmds = recents
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is Command => Boolean(c))
        .slice(0, 5);
      const suggested = commands
        .filter((c) => ['cap.area', 'cap.full', 'light.restore', 'sound.mute'].includes(c.id))
        .filter((c) => !recentCmds.includes(c));
      const out: { label: string; items: Command[] }[] = [];
      if (recentCmds.length) out.push({ label: 'Recent', items: recentCmds });
      out.push({ label: 'Suggested', items: suggested });
      const groupOrder = ['Navigate', 'Display', 'Lights', 'Sound', 'System', 'Accents', 'Capture'];
      for (const g of groupOrder) {
        const items = commands.filter((c) => c.group === g);
        if (items.length) out.push({ label: g, items });
      }
      return out;
    }
    const ranked = fuzzyFilter(query, commands, (c) => `${c.title} ${c.keywords ?? ''}`);
    return [{ label: 'Results', items: ranked.map((r) => r.item) }];
  }, [query, commands, recents]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Reset when opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keep active item in view.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, groups]);

  if (!open) return null;

  const run = (cmd: Command) => {
    const next = [cmd.id, ...recents.filter((id) => id !== cmd.id)].slice(0, 8);
    setRecents(next);
    try {
      sessionStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    onClose();
    // run after close so navigation/toasts feel immediate
    requestAnimationFrame(() => cmd.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = flat[active];
      if (cmd) run(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let runningIndex = -1;

  return (
    <div className="cmdk" onMouseDown={onClose} style={{ ['--accent' as string]: accent }}>
      <div
        className={`cmdk__surface ${surfaceClass ?? ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdk__search">
          <Search size={17} className="cmdk__searchicon" />
          <input
            ref={inputRef}
            className="cmdk__input"
            placeholder="Search actions — capture, presets, volume, sleep…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="cmdk__esc">esc</kbd>
        </div>

        <div className="cmdk__list" ref={listRef}>
          {flat.length === 0 && (
            <div className="cmdk__empty">
              No actions match <span className="cmdk__emptyq">“{query}”</span>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label} className="cmdk__group">
              <div className="cmdk__grouplabel">{g.label}</div>
              {g.items.map((cmd) => {
                runningIndex++;
                const idx = runningIndex;
                const isActive = idx === active;
                return (
                  <button
                    key={cmd.id}
                    className="cmdk__row"
                    data-active={isActive}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => run(cmd)}
                  >
                    <span className="cmdk__rowmain">
                      <span className="cmdk__rowtitle">{cmd.title}</span>
                      {cmd.subtitle && <span className="cmdk__rowsub">{cmd.subtitle}</span>}
                    </span>
                    {cmd.meta && (
                      <span className="cmdk__meta">
                        {/^#/.test(cmd.meta) ? (
                          <span className="cmdk__swatch" style={{ background: cmd.meta }} />
                        ) : null}
                        {cmd.meta}
                      </span>
                    )}
                    {isActive && <CornerDownLeft size={13} className="cmdk__enter" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="cmdk__foot">
          <span className="cmdk__hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span className="cmdk__hint">
            <kbd>↵</kbd> run
          </span>
          <span className="cmdk__count">{flat.length} actions</span>
        </div>
      </div>
    </div>
  );
}
