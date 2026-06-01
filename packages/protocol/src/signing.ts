// Pure ed25519 request signer for the companion contract.
//
// Extracted from the phone companion so the byte layout lives in exactly one
// place. The signed message and header encoding must stay identical to what the
// Rust server verifies in `commands/companion.rs::verify_signature` — a
// mismatch breaks pairing silently.
//
// Depends only on `@noble/*` (pure JS, runs in both the React Native runtime
// and the desktop webview). Randomness is injected by the caller (`nonce`,
// `privateKeyBytes`) so this module stays platform-agnostic about RNG.

import * as ed25519 from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';

import { HEADERS } from './constants';

// @noble/ed25519 v3 needs a sha512 implementation wired in once.
ed25519.hashes.sha512 = sha512;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The exact message the device signs and the server reconstructs:
 * `method\npath\ntimestamp\nnonce\nbodySha256`. Keep in lockstep with
 * `signing_message` in companion.rs.
 */
export function buildSigningMessage(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodySha256: string,
): string {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodySha256}`;
}

export interface SignRequestParams {
  /** base64-encoded ed25519 private key (the paired device's). */
  privateKey: string;
  /** Bearer device token issued by `/v1/pair`. */
  deviceToken: string;
  /** HTTP method, e.g. `GET` / `POST`. */
  method: string;
  /** Request path, e.g. `/v1/snapshot`. */
  path: string;
  /** Raw request body (empty for GETs). */
  body?: string;
  /** Caller-supplied unique hex nonce (16–128 hex chars enforced server-side). */
  nonce: string;
  /** Unix epoch seconds; defaults to now. */
  timestampSeconds?: number;
}

/**
 * Build the full set of request headers (auth + signature) for a companion
 * request. Returns a plain header map suitable for `fetch`.
 */
export function signedHeaders(
  params: SignRequestParams,
): Record<string, string> {
  const timestamp = (
    params.timestampSeconds ?? Math.floor(Date.now() / 1000)
  ).toString();
  const bodyBytes = new TextEncoder().encode(params.body ?? '');
  const bodySha256 = bytesToHex(sha256(bodyBytes));
  const message = buildSigningMessage(
    params.method,
    params.path,
    timestamp,
    params.nonce,
    bodySha256,
  );
  const signature = ed25519.sign(
    new TextEncoder().encode(message),
    base64ToBytes(params.privateKey),
  );
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.deviceToken}`,
    [HEADERS.timestamp]: timestamp,
    [HEADERS.nonce]: params.nonce,
    [HEADERS.bodySha256]: bodySha256,
    [HEADERS.signature]: bytesToBase64(signature),
  };
}

/**
 * Derive a base64 keypair from caller-supplied random bytes (32 bytes). The
 * public key is what the device sends to `/v1/pair`; the server base64-decodes
 * it to a 32-byte ed25519 verifying key.
 */
export function generateKeyPair(privateKeyBytes: Uint8Array): {
  privateKey: string;
  publicKey: string;
} {
  const publicKey = ed25519.getPublicKey(privateKeyBytes);
  return {
    privateKey: bytesToBase64(privateKeyBytes),
    publicKey: bytesToBase64(publicKey),
  };
}
