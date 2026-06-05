import {
  ENDPOINTS,
  type CompanionSnapshot,
  type HelloResponse,
} from '@pane/protocol';
import { fetchWithTimeout, fetchSnapshot } from './api';
import { baseUrl } from './pairing';
import { REQUEST_TIMEOUT_MS } from './constants';
import type { Pairing } from './types';

export interface CompanionQueryData {
  helloName: string;
  snapshot: CompanionSnapshot;
}

export async function fetchCompanion(
  pairing: Pairing,
): Promise<CompanionQueryData> {
  const response = await fetchWithTimeout(
    `${baseUrl(pairing)}${ENDPOINTS.hello}`,
    {},
    REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`hello ${response.status}`);
  const hello = (await response.json()) as HelloResponse;
  const snapshot = await fetchSnapshot(pairing);
  return { helloName: hello.name, snapshot };
}
