import { useEffect, useRef } from 'react';

/**
 * Default delay for hardware/IPC writes that shouldn't fire on every pixel of a
 * slider drag. DDC/CI and audio endpoints are slow; we push once the value
 * settles. (BrightnessCard historically used 150ms, SoundCard 100ms — unified.)
 */
export const WRITE_DEBOUNCE_MS = 120;

/**
 * Returns `schedule(key, run)` that debounces `run` **per key**, so dragging one
 * control never cancels another control's pending write (the bug a single shared
 * timer caused). Outstanding timers are cleared on unmount.
 */
export function useDebouncedWrite(delayMs = WRITE_DEBOUNCE_MS) {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of Object.values(pending)) clearTimeout(id);
    };
  }, []);

  return (key: string, run: () => void) => {
    const existing = timers.current[key];
    if (existing) clearTimeout(existing);
    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      run();
    }, delayMs);
  };
}
