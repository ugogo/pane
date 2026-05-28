import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateCheckResult =
  | { status: "skipped" | "current" | "installed" }
  | { status: "error"; message: string };

function formatUpdateError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "An unknown update error occurred.";
}

/**
 * Check GitHub Releases for a newer signed build, install it silently, then
 * offer to restart. Runs once on launch.
 *
 * No-ops in dev: dev builds carry a placeholder version and there's no signed
 * artifact to update to, so a check would only ever fail.
 */
export async function checkForUpdatesOnLaunch(): Promise<UpdateCheckResult> {
  if (import.meta.env.DEV) return { status: "skipped" };

  try {
    const update = await check();
    if (!update) return { status: "current" };

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

    return { status: "installed" };
  } catch (err) {
    console.error("Update check failed", err);
    return { status: "error", message: formatUpdateError(err) };
  }
}
