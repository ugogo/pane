# Pane (Tauri shell)

Tauri 2 desktop wrapper for the Pane Windows app. The frontend is built by Vite
(`npm run build` → `../dist`) and bundled here.

## ⚠️ Do not remove `dangerousDisableAssetCspModification` from `tauri.conf.json`

`app.security` intentionally carries:

```jsonc
"style-src 'self' 'unsafe-inline'"           // in the csp
"dangerousDisableAssetCspModification": ["style-src"]
```

Tauri's config schema forbids inline comments (`additionalProperties: false` on
`security`), so the reasoning lives here:

- Tamagui currently injects its component and theme CSS into `<style>` tags
  **at runtime** in the Windows Vite app.
- By default Tauri stamps a **nonce** onto `style-src` when it post-processes the
  bundled `index.html`. Per the CSP spec, once a nonce is present `'unsafe-inline'`
  is **ignored** — so every runtime-injected `<style>` (which has no nonce) is
  rejected by WebView2 and the app renders **partially unstyled**.
- This was the v1.2.0–v1.4.5 "production app is unstyled" bug. v1.2.0 migrated the
  Windows app from compiled-CSS (`<link>`) to Tamagui runtime injection, which is
  exactly when the nonce CSP started blocking styles.
- `dangerousDisableAssetCspModification: ["style-src"]` stops Tauri from adding the
  style nonce, so `'unsafe-inline'` stays effective. It is scoped to `style-src`
  **only** — `script-src` keeps its nonce, so script injection is still blocked.
  The residual risk (inline CSS) is low for a local app serving its own bundled
  assets over `'self'`.

**Remove this flag only** once Tamagui compile-time extraction works under React 19
and the CSS ships as a static `<link>` (like `src/styles/shell.css` already does). At that
point there's no runtime injection, `'unsafe-inline'` is no longer needed, and the
flag can be dropped in favor of the default nonce hardening.

> The browser is **not** a faithful proxy for this: a plain browser honors the
> `<meta>` CSP in `index.html` (which has `unsafe-inline`, no nonce) and looks fine,
> while the shipped exe enforces a *header* CSP *with* a nonce. To verify WebView2
> styling for real, build a debug exe (`npx tauri build --debug`), launch it with
> `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, and inspect
> via CDP — check that injected `<style>` tags have a non-null `.sheet`.
