import { useEffect } from 'react';
import { listen, type EventCallback } from '@tauri-apps/api/event';
import { useEffectEvent } from './use-effect-event';

/**
 * Subscribe to a Tauri event for the component's lifetime. The handler always
 * sees the latest props/state (via `useEffectEvent`) without re-subscribing, and
 * the listener is torn down on unmount.
 *
 * Replaces the repeated
 * `const un = listen(...); return () => void un.then((off) => off())` plumbing
 * across the feature cards and popup windows.
 */
export function useTauriEvent<T>(
  event: string,
  handler: EventCallback<T>,
): void {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const unlisten = listen<T>(event, (payload) => onEvent(payload));
    return () => {
      void unlisten.then((off) => off());
    };
  }, [event]);
}
