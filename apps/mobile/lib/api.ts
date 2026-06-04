import { ENDPOINTS, type CompanionCommand, type CompanionSnapshot } from '@pane/protocol';
import { baseUrl } from './pairing';
import { headersFor } from './crypto';
import { REQUEST_TIMEOUT_MS } from './constants';
import type { Pairing } from './types';

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSnapshot(pairing: Pairing): Promise<CompanionSnapshot> {
  const response = await fetchWithTimeout(
    `${baseUrl(pairing)}${ENDPOINTS.snapshot}`,
    { headers: headersFor(pairing, 'GET', ENDPOINTS.snapshot) },
    REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`snapshot ${response.status}`);
  return (await response.json()) as CompanionSnapshot;
}

export async function sendCommand(pairing: Pairing, body: CompanionCommand): Promise<void> {
  const encodedBody = JSON.stringify(body);
  const response = await fetchWithTimeout(
    `${baseUrl(pairing)}${ENDPOINTS.commands}`,
    {
      method: 'POST',
      headers: headersFor(pairing, 'POST', ENDPOINTS.commands, encodedBody),
      body: encodedBody,
    },
    REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`Command failed (${response.status})`);
}
