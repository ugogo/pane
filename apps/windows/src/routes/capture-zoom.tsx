import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { createFileRoute } from '@tanstack/react-router';
import { XIcon } from 'lucide-react';
import { hideCaptureZoom, takeLatestCaptureFull } from '@/lib/commands';
import { useEffectEvent } from '@/lib/use-effect-event';

export const Route = createFileRoute('/capture-zoom')({
  component: CaptureZoomPage,
});

function CaptureZoomPage() {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  function fetchFull() {
    return takeLatestCaptureFull()
      .then((c) => {
        setSrc(c.dataUrl);
        setError(undefined);
      })
      .catch((e: unknown) => setError(String(e)));
  }

  const onFetch = useEffectEvent(() => void fetchFull());

  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-initialize-state -- capture zoom fetches on window open
    onFetch();

    const unlisten = listen('refresh-capture', () => {
      onFetch();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Escape') {
        e.preventDefault();
        void hideCaptureZoom();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      void unlisten.then((u) => u());
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-transparent"
      data-tauri-drag-region
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-lg border border-border bg-card shadow-[0_8px_24px_var(--app-shadow-strong)] [&_img]:-outline-offset-1 [&_img]:outline [&_img]:outline-white/10"
        data-tauri-drag-region
      >
        {error ? (
          <p className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {!error && src ? (
          <img
            src={src}
            alt="Enlarged capture preview"
            draggable={false}
            data-tauri-drag-region
            style={{
              pointerEvents: 'none',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        ) : null}

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void hideCaptureZoom()}
          className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--app-preview-control)] text-foreground shadow-[0_4px_12px_var(--app-shadow)] transition-colors duration-120 hover:bg-accent"
          aria-label="Close preview"
        >
          <XIcon aria-hidden size={16} />
        </button>
      </div>
    </div>
  );
}
