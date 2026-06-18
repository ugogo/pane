import { createContext, use } from 'react';
import type { useUpdateCheck } from '@/lib/use-update-check';

export const UpdateCheckContext = createContext<ReturnType<
  typeof useUpdateCheck
> | null>(null);

export function useUpdateCheckContext() {
  const value = use(UpdateCheckContext);
  if (!value) {
    throw new Error('UpdateCheckContext is unavailable.');
  }
  return value;
}
