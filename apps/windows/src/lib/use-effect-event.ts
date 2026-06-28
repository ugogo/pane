import { useInsertionEffect, useRef } from 'react';

/**
 * Userland shim for React's `useEffectEvent`. The hook is a stable `react`
 * export only as of React 19.2, but the app is pinned to React 19.1.0, which
 * doesn't export it. The stable-identity guarantee comes from the ref — React
 * Compiler memoizes the returned function automatically.
 */
export function useEffectEvent<TArgs extends unknown[], TReturn>(
  callback: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  const ref = useRef(callback);
  useInsertionEffect(() => {
    ref.current = callback;
  });
  return (...args: TArgs) => ref.current(...args);
}
