import * as SecureStore from 'expo-secure-store';
import { STORE_KEY } from './constants';
import { isPairing } from './pairing';
import type { Pairing } from './types';

export async function loadStoredPairing(): Promise<Pairing | null> {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) return null;
  const saved = JSON.parse(raw) as unknown;
  return isPairing(saved) ? saved : null;
}
