import * as Crypto from 'expo-crypto';
import { bytesToHex, signedHeaders } from '@pane/protocol';
import type { Pairing } from './types';

export function randomNonce(): string {
  return bytesToHex(Crypto.getRandomBytes(16));
}

// Adapt the platform-agnostic @pane/protocol signer to this device's keys,
// supplying a fresh expo-crypto nonce per request.
export function headersFor(
  pairing: Pairing,
  method: string,
  path: string,
  body = '',
): Record<string, string> {
  return signedHeaders({
    privateKey: pairing.privateKey,
    deviceToken: pairing.deviceToken,
    method,
    path,
    body,
    nonce: randomNonce(),
  });
}
