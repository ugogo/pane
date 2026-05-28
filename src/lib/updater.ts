import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Check GitHub Releases for a newer signed build, install it silently, then
 * offer to restart. Runs once on launch.
 *
 * No-ops in dev: dev builds carry a placeholder version and there's no signed
 * artifact to update to, so a check would only ever fail.
 */
export async function checkForUpdatesOnLaunch() {
  if (import.meta.env.DEV) return;

  try {
    const update = await check();
    if (!update) return;

    // downloadAndInstall fetches the NSIS installer, verifies its ed25519
    // signature against the embedded pubkey, and runs it. A failed signature
    // check throws here, so a tampered package never installs.
    await update.downloadAndInstall();

    const restart = window.confirm(
      `Home ${update.version} has been installed. Restart now to apply it?`,
    );
    if (restart) {
      await relaunch();
    }
  } catch (err) {
    // A missing release feed or offline machine shouldn't surface as an error
    // to the user — just log and move on.
    console.error("Update check failed", err);
  }
}
