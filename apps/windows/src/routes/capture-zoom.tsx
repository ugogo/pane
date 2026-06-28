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
      <div className="capture-zoom-card" data-tauri-drag-region>
        {error ? <p className="capture-zoom-error">{error}</p> : null}
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
          className="capture-zoom-close"
          aria-label="Close preview"
        >
          <XIcon aria-hidden size={16} />
        </button>
      </div>
    </div>
  );
}
