import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { prepareCaptureWindows } from '@/lib/commands';
import { formatAppError } from '@/lib/format-app-error';
import { revealMainWindow } from '@/lib/reveal-main-window';

const BOOT_TIMEOUT_MS = 15_000;

/**
 * Gates the first paint of the main window: waits for the initial render (two
 * RAFs) plus a short minimum so the shell doesn't flash, loads the app version,
 * then reveals the Tauri window and pre-warms the capture windows. State is set
 * from deferred `.then` callbacks so it doesn't trip `set-state-in-effect`.
 */
export function useAppBoot() {
  const [isBooting, setIsBooting] = useState(true);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let bootTimer = 0;
    let bootTimeout = 0;
    let finished = false;

    const finishBoot = (error: string | null) => {
      if (cancelled || finished) return;
      finished = true;
      if (error) setBootError(error);
      setIsBooting(false);
      window.clearTimeout(bootTimeout);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void revealMainWindow().catch((err) => {
            if (cancelled) return;
            setBootError((current) => current ?? formatAppError(err));
            setIsBooting(false);
          });

          if (error) return;

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
    };

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

    bootTimeout = window.setTimeout(() => {
      finishBoot(
        'Pane is taking too long to start. Try closing and reopening the app.',
      );
    }, BOOT_TIMEOUT_MS);

    void Promise.allSettled([afterFirstPaint, minimumBoot, versionTask]).then(
      () => {
        finishBoot(null);
      },
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(bootTimer);
      window.clearTimeout(bootTimeout);
    };
  }, []);

  return { isBooting, appVersion, bootError };
}
