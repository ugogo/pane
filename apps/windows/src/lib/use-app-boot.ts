import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { prepareCaptureWindows } from '@/lib/commands';

/**
 * Gates the first paint of the main window: waits for the initial render (two
 * RAFs) plus a short minimum so the shell doesn't flash, loads the app version,
 * then reveals the Tauri window and pre-warms the capture windows. State is set
 * from deferred `.then` callbacks so it doesn't trip `set-state-in-effect`.
 */
export function useAppBoot() {
  const [isBooting, setIsBooting] = useState(true);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let bootTimer = 0;

    const afterFirstPaint = new Promise<void>((resolve) => {
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => resolve());
      });
    });
    const minimumBoot = new Promise<void>((resolve) => {
      bootTimer = window.setTimeout(resolve, 160);
    });
    const versionTask = getVersion()
      .then(setAppVersion)
      .catch((err) => {
        console.error('Failed to load app version', err);
      });

    void Promise.allSettled([afterFirstPaint, minimumBoot, versionTask]).then(
      () => {
        if (cancelled) return;
        setIsBooting(false);

        // Reveal the shell first, then warm hidden capture webviews on idle time.
        // v1.3.0 pre-warmed the image editor here as well; building several heavy
        // child webviews in parallel with the first main-window paint left some
        // production installs stuck on the acrylic splash with no content.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void getCurrentWindow().show().catch(console.error);

            const warmCaptureWindows = () => {
              if (cancelled) return;
              void prepareCaptureWindows().catch((err) => {
                console.error('Failed to prepare capture windows', err);
              });
            };

            if (typeof window.requestIdleCallback === 'function') {
              window.requestIdleCallback(warmCaptureWindows, { timeout: 2000 });
            } else {
              window.setTimeout(warmCaptureWindows, 500);
            }
          });
        });
      },
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(bootTimer);
    };
  }, []);

  return { isBooting, appVersion };
}
