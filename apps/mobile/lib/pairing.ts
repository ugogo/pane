import type { Pairing, ParsedUri } from './types';

export function baseUrl(pairing: Pick<Pairing, 'host' | 'port'>): string {
  return `http://${pairing.host}:${pairing.port}`;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isPairing(value: unknown): value is Pairing {
  const candidate = value as Partial<Pairing>;
  return (
    candidate?.scheme === 'http' &&
    typeof candidate.host === 'string' &&
    typeof candidate.port === 'number' &&
    typeof candidate.deviceToken === 'string' &&
    typeof candidate.privateKey === 'string' &&
    typeof candidate.publicKey === 'string'
  );
}

// Parse a `pane://pair?host=..&port=..&token=..` QR payload. Custom-scheme URLs
// parse unreliably across platforms, so read the query string by hand.
export function parsePairingUri(data: string): ParsedUri | null {
  if (!data.startsWith('pane://pair')) return null;
  const query = data.slice(data.indexOf('?') + 1);
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=');
    if (key) params.set(key, decodeURIComponent(value ?? ''));
  }
  const host = params.get('host');
  const port = Number(params.get('port'));
  const token = params.get('token');
  const scheme = params.get('scheme');
  if (scheme !== 'http' || !host || !Number.isInteger(port) || !token) {
    return null;
  }
  return { scheme, host, port, token };
}
