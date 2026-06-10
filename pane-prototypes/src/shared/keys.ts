import { useCallback, useEffect, useRef, useState } from 'react';

// Display + capture helpers for keyboard chords.

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const GLYPH: Record<string, string> = {
  Ctrl: IS_MAC ? '⌘' : 'Ctrl',
  Meta: IS_MAC ? '⌘' : 'Win',
  Cmd: '⌘',
  Alt: IS_MAC ? '⌥' : 'Alt',
  Shift: IS_MAC ? '⇧' : 'Shift',
  Enter: '↵',
  Escape: 'Esc',
  Esc: 'Esc',
  Delete: 'Del',
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export function keyGlyph(key: string): string {
  return GLYPH[key] ?? key;
}

export function formatChord(chord: string[], sep = ''): string {
  return chord.map(keyGlyph).join(sep);
}

const MOD_ORDER = ['Ctrl', 'Meta', 'Alt', 'Shift'];

// Normalise a KeyboardEvent into our chord representation.
export function chordFromEvent(e: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.metaKey) mods.push('Meta');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  let main = e.key;
  if (main === ' ') main = 'Space';
  else if (main.length === 1) main = main.toUpperCase();

  const isMod = ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key);
  const chord = [...mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b))];
  if (!isMod) chord.push(main);
  return chord;
}

export function chordEq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

// Global hotkey hook. Pass a map of "Ctrl+K" style strings -> handlers.
// Matching is mod-insensitive between Ctrl/Meta so ⌘K and Ctrl+K both fire.
export function useHotkeys(
  bindings: Record<string, (e: KeyboardEvent) => void>,
  deps: unknown[] = [],
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('mod');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');
      let main = e.key.toLowerCase();
      if (main === ' ') main = 'space';
      parts.push(main);
      const key = parts.join('+');
      const fn = bindings[key];
      if (fn) fn(e);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Chord-capture hook for hotkey binding inputs. Listens while `capturing`,
// records the pressed chord, and stops on the first non-modifier key.
export function useChordCapture(onCommit?: (chord: string[]) => void) {
  const [capturing, setCapturing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const committed = useRef(false);

  const start = useCallback(() => {
    committed.current = false;
    setDraft([]);
    setCapturing(true);
  }, []);

  const stop = useCallback(() => setCapturing(false), []);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        setDraft([]);
        return;
      }
      const chord = chordFromEvent(e);
      setDraft(chord);
      const isModOnly = ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key);
      if (!isModOnly && !committed.current) {
        committed.current = true;
        setCapturing(false);
        onCommit?.(chord);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, onCommit]);

  return { capturing, draft, start, stop };
}
