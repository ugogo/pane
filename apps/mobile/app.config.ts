import type { ConfigContext, ExpoConfig } from 'expo/config';

// Dynamic Expo config so the same codebase runs as two distinct apps in Expo
// Go: the everyday dev bundle and a production-mode bundle (`--no-dev
// --minify`). Expo Go namespaces persisted data — including the SecureStore
// pairing (`pane.pairing.v1`) — by `slug`, NOT by display name. Giving each
// variant its own slug keeps their pairings in separate keychains, so running
// the dev script can't overwrite a phone already paired via the prod script.
//
// APP_VARIANT is set by the npm scripts (see package.json). It defaults to dev
// so a bare `expo start` stays on the isolated dev identity. Both variants are
// symmetric: a `pane-companion-{env}` slug and a `pane.companion.{env}` bundle
// id, mirroring the desktop's `pane.dev` / `pane.prod` identifier split.
const VARIANTS = {
  dev: {
    name: 'Pane (dev)',
    slug: 'pane-companion-dev',
    bundleId: 'pane.companion.dev',
  },
  prod: {
    name: 'Pane (prod)',
    slug: 'pane-companion-prod',
    bundleId: 'pane.companion.prod',
  },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT === 'prod' ? 'prod' : 'dev';
  const { name, slug, bundleId } = VARIANTS[variant];

  return {
    ...config,
    name,
    slug,
    ios: { ...config.ios, bundleIdentifier: bundleId },
    android: { ...config.android, package: bundleId },
  };
};
