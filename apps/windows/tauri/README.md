# Pane (Tauri shell)

Tauri 2 desktop wrapper for the Pane Windows app. The frontend is built by Vite
(`pnpm run build` -> `../dist`) and bundled here.

## ⚠️ Do not remove `dangerousDisableAssetCspModification` from `tauri.conf.json`

`app.security` intentionally carries:

```jsonc
"style-src 'self' 'unsafe-inline'"           // in the csp
"dangerousDisableAssetCspModification": ["style-src"]
```

Tauri's config schema forbids inline comments (`additionalProperties: false` on
`security`), so the reasoning lives here:

- Pane's capture, editor, and window surfaces use React `style` attributes for
  runtime geometry, transforms, colors, and capture dimensions.
- By default Tauri stamps a **nonce** onto `style-src` when it post-processes the
  bundled `index.html`. Per the CSP spec, once a nonce is present `'unsafe-inline'`
  is **ignored** — so every runtime-injected `<style>` (which has no nonce) is
  rejected by WebView2 and those surfaces render **partially unstyled**.
- `dangerousDisableAssetCspModification: ["style-src"]` stops Tauri from adding the
  style nonce, so `'unsafe-inline'` stays effective. It is scoped to `style-src`
  **only** — `script-src` keeps its nonce, so script injection is still blocked.
  The residual risk (inline CSS) is low for a local app serving its own bundled
  assets over `'self'`; Pickle/Tailwind styles themselves ship as a static file.

**Remove this flag only** after replacing every runtime `style` attribute with a
nonce-compatible alternative. Pickle's static CSS migration alone does not make
that safe.

> The browser is **not** a faithful proxy for this: a plain browser honors the
> `<meta>` CSP in `index.html` (which has `unsafe-inline`, no nonce) and looks fine,
> while the shipped exe enforces a *header* CSP *with* a nonce. To verify WebView2
> styling for real, build a debug exe (`pnpm exec tauri build --debug`), launch it with
> `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, and inspect
> via CDP — check that injected `<style>` tags have a non-null `.sheet`.
