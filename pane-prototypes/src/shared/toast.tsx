import { useEffect, useState } from 'react';

// A tiny module-level toast bus so mock actions can emit feedback from
// anywhere (store, command palette, hotkeys) without prop drilling.

export interface Toast {
  id: number;
  message: string;
  detail?: string;
  tone: 'default' | 'success' | 'warn' | 'error';
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l([...toasts]);
}

export function toast(
  message: string,
  opts: { detail?: string; tone?: Toast['tone']; ttl?: number } = {},
) {
  const id = ++seq;
  toasts = [...toasts, { id, message, detail: opts.detail, tone: opts.tone ?? 'default' }];
  emit();
  const ttl = opts.ttl ?? 2600;
  window.setTimeout(() => dismissToast(id), ttl);
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setList);
    setList([...toasts]);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}
