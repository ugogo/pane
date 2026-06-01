// Single source of truth for the companion HTTP contract.
//
// These values are mirrored on the Rust side in
// `apps/windows/tauri/src/commands/companion.rs` (paths, header names, TTLs, service
// type). If you change one here, change it there too — pairing breaks silently
// otherwise. Phase 3 of the monorepo plan replaces the hand-mirrored *types*
// with codegen, but these constants stay hand-maintained on both sides.

/** Companion HTTP endpoints, all under the `/v1` prefix. */
export const ENDPOINTS = {
  /** Unauthenticated liveness + identity probe. */
  hello: '/v1/hello',
  /** Exchange a one-time pairing token for a bearer device token. */
  pair: '/v1/pair',
  /** Apply an allowlisted command (signed). */
  commands: '/v1/commands',
  /** Read the current settings snapshot (signed). */
  snapshot: '/v1/snapshot',
  /** Server-sent snapshot stream (signed). */
  events: '/v1/events',
} as const;

/**
 * Signed-request header names. HTTP header names are case-insensitive; these
 * are the lowercase forms the Rust server reads (`HEADER_*` in companion.rs).
 */
export const HEADERS = {
  signature: 'x-pane-signature',
  timestamp: 'x-pane-timestamp',
  nonce: 'x-pane-nonce',
  bodySha256: 'x-pane-body-sha256',
} as const;

/** mDNS service type advertised on the LAN (`SERVICE_TYPE` in companion.rs). */
export const SERVICE_TYPE = '_pane._tcp.local';

/** How long a pairing session stays valid (`PAIRING_TTL_SECONDS`). */
export const PAIRING_TTL_SECONDS = 120;

/** Max clock skew tolerated on a signed request (`SIGNATURE_MAX_SKEW_SECONDS`). */
export const SIGNATURE_MAX_SKEW_SECONDS = 300;
