import { useEffect, useState } from 'react';

// Session-scoped persisted state so each prototype keeps its place
// (current page, open panel) when you jump away via the switcher and back.
export function usePersistentState<T>(key: string, initial: T) {
  const storageKey = `pane:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [storageKey, value]);
  return [value, setValue] as const;
}
