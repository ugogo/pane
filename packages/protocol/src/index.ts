// @pane/protocol — the shared companion HTTP contract.
//
// Imported by both the desktop frontend (`apps/windows/src`, currently `src`)
// and the phone companion (`apps/mobile`, currently `mobile/companion`). Plain
// TypeScript source with no build step so Metro and Vite both transpile it
// like first-party code.

export * from './constants';
export * from './types';
export * from './signing';
