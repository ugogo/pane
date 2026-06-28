# Windows Expo and React Native Removal Plan

## Summary

The Windows app has already moved from Expo Router/Metro to Vite + TanStack
Router. The next migration removes the remaining React Native compatibility
layer from Windows by replacing `@pane/ui` usage with Windows-local web
components. The companion app stays Expo/React Native and continues to use
`@pane/ui`.

Target outcome:

- `apps/windows` depends on React, React DOM, Vite, TanStack Router, TanStack
  Query, Tauri APIs, and web-only utilities.
- `apps/windows` has no dependency on Expo, React Native, React Native Web,
  Tamagui, native slider packages, React Native SVG, or `@pane/ui`.
- Public Windows routes remain unchanged.

## Current State

- Windows entrypoint is `apps/windows/src/main.tsx`.
- Windows routes live in `apps/windows/src/routes/`.
- TanStack generates `apps/windows/src/routeTree.gen.ts` during Vite dev/build.
  Keep this file checked in so `tsc --noEmit` works from a fresh checkout; no
  manual generation command is required.
- `apps/windows/app/windows.generated.css` is stale from the old app tree and
  should be deleted during cleanup.
- Windows still imports `@pane/ui`, which pulls in Tamagui and some
  React-Native-shaped dependencies.
- Vite currently uses temporary Windows-only shims for native modules. These
  shims should disappear by the end of this migration.

## Implementation Plan

### 1. Create a Windows-local UI layer

Add `apps/windows/src/ui/` with web-native React components that cover the
Windows app's current `@pane/ui` surface:

- Text primitives: `Text`, `MutedText`, `Label`.
- Layout primitives: `View`, `XStack`, `YStack`, `ScrollView`.
- Controls: `Button`, `IconButton`, `Switch`, `Slider`.
- Surfaces and helpers: `Card`, `Badge`, `MutedPanel`, `SectionList`,
  `ListRow`, `ListRowButton`, `ListRowContent`, `ListDot`, `Stat`,
  `DeviceIcon`, preset button/group components, slider label/value/row
  components.
- Motion wrappers: `PageTransition` and `PopupTransition`.

Implementation rules:

- Use plain DOM elements and CSS modules or shared CSS classes, not Tamagui.
- Keep names and simple prop shapes close to the existing usage to make route
  migration mechanical.
- Use CSS variables from `apps/windows/src/styles/global.css` and
  `apps/windows/src/styles/shell.css` as the visual source of truth.
- Preserve existing accessibility behavior: real buttons, labels, ARIA
  attributes, disabled states, keyboard/focus-visible styling.

### 2. Replace Windows imports

Update every `apps/windows/src/**` import from `@pane/ui` to `@/ui`.

During replacement:

- Convert Tamagui token props such as `gap="$3"`, `padding="$4"`,
  `backgroundColor="$background"`, `borderColor="$borderColor"`, and
  `fontSize="$3"` into supported local component props or class/style values.
- Preserve the rendered hierarchy and behavior first; avoid visual redesign.
- Keep all route URLs unchanged:
  `/capture`, `/display`, `/sound`, `/lights`, `/accent`, `/startup`,
  `/companion`, `/diagnostics`, `/area-selector`, `/preview`, `/capture-zoom`,
  `/image-editor`, `/accent-popup`.
- Keep the Windows-local `WebQRCode` component for the companion pairing card.

### 3. Remove providers and runtime styling hooks

Remove Tamagui-specific app setup:

- Delete `UIProvider` usage from `apps/windows/src/routes/__root.tsx`.
- Remove `@tamagui/web/reset.css` from the Windows root route.
- Keep `AppErrorBoundary`, `PaneQueryProvider`, and the existing CSS imports.
- Keep `register-geist-font` unless the font is moved to a static CSS
  `@font-face` in `global.css`.

### 4. Remove compatibility shims and dependencies

After Windows no longer imports `@pane/ui`, remove:

- `apps/windows/src/shims/native-slider.tsx`
- `apps/windows/src/shims/react-native-svg.tsx`
- Vite aliases for `react-native`, `react-native-web`,
  `@react-native-community/slider`, and `react-native-svg`.
- `react-native-web` from `apps/windows/package.json`.
- `@pane/ui` from `apps/windows/package.json`.

Confirm `apps/windows/package.json` does not include Expo, Metro, React Native,
Tamagui, native slider, or React Native SVG packages.

### 5. Clean stale generated files

Delete stale Windows app-tree leftovers:

- `apps/windows/app/windows.generated.css`
- `apps/windows/app/` if it is empty after that deletion.

Update ignore files:

- Remove `apps/windows/app/windows.generated.css` from `.prettierignore` once
  the file is deleted.
- Keep `apps/windows/src/routeTree.gen.ts` ignored by Prettier and ESLint if
  the generated header continues to request it.

### 6. Keep companion boundaries intact

Do not migrate the companion app in this plan.

- `apps/mobile` remains Expo/React Native.
- `packages/ui` remains available for `apps/mobile`.
- Do not remove React Native, Tamagui, or Expo dependencies that are still used
  by `apps/mobile` or `packages/ui`.

## Acceptance Criteria

- `rg -n "from ['\"]@pane/ui['\"]|@pane/ui" apps/windows` returns no Windows
  app imports, except documentation if intentionally retained.
- `rg -n "react-native|react-native-web|@tamagui|tamagui|expo|metro"`
  `apps/windows apps/windows/package.json apps/windows/vite.config.ts` returns
  no active Windows runtime/build references, except historical docs or
  companion-specific text outside `apps/windows`.
- `apps/windows/package.json` has no `@pane/ui`, Expo, Metro, React Native,
  React Native Web, Tamagui, native slider, or React Native SVG dependency.
- Vite build no longer needs Windows native-module shims.
- The companion app still typechecks.

## Test Plan

Run:

```powershell
npm install
npm run lint
npm run typecheck
npm run format:check
npm run build -w @pane/windows
npm run rust:fmt:check
npm run tauri:gen:check
```

Manual smoke test with `npm run dev`:

- Main window boots and reveals correctly.
- Sidebar navigation works for all dashboard modules.
- Capture fullscreen, area selector, floating preview, zoom window, and image
  editor still work.
- Accent popup opens and receives initial `chars` query data.
- Companion page displays the pairing QR code and trusted-device states.
- Dev updater state still skips update checks.
- Child windows still load direct route paths through
  `child_webview_url::routes`.

## Notes for the Implementing Agent

- Keep changes behavior-preserving. This is a platform cleanup, not a visual
  redesign.
- Prefer one mechanical page at a time: add the local UI primitive, migrate
  consumers, run `npm run typecheck -w @pane/windows`, then continue.
- Do not delete `packages/ui`; it is still part of the companion app.
- Do not remove `apps/windows/src/routeTree.gen.ts`; TanStack regenerates it,
  but it should remain checked in.
