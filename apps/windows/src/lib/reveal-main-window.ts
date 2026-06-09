import { getCurrentWindow } from '@tauri-apps/api/window';

/** Show the main Tauri window so boot failures are visible instead of a blank acrylic shell. */
export function revealMainWindow() {
  return getCurrentWindow().show();
}
