import { useEffect, useRef, useState } from 'react';
import Pica from 'pica';
import { listen } from '@tauri-apps/api/event';
import { Check, Lock, RotateCcw, Save, Unlock, X } from '@pane/ui';
import {
  hideImageEditor,
  saveEditedCaptureToDesktop,
  takeLatestCaptureFull,
} from '@/lib/commands';
import { useEffectEvent } from '@/lib/use-effect-event';

// Pure-JS pica: the app's CSP forbids wasm/eval and blob web workers, so the
// default ['js','wasm','ww'] feature set would fail. Lanczos in plain JS is
// plenty fast for one screenshot.
const pica = new Pica({ features: ['js'] });

const SCALE_PRESETS = [0.25, 0.5, 0.75, 1] as const;

type SaveState = 'idle' | 'busy' | 'success';

interface Dimensions {
  width: number;
  height: number;
}

function clampDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20000, Math.max(1, Math.round(value)));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read blob.'));
    reader.readAsDataURL(blob);
  });
}

export default function ImageEditorPage() {
  const [src, setSrc] = useState<string | null>(null);
  const [base, setBase] = useState<Dimensions | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [save, setSave] = useState<SaveState>('idle');
  const [savedPath, setSavedPath] = useState<string>();
  const [error, setError] = useState<string>();

  const imgRef = useRef<HTMLImageElement>(null);

  function fetchCapture() {
    return takeLatestCaptureFull()
      .then((c) => {
        setSrc(c.dataUrl);
        setError(undefined);
        setSave('idle');
        setSavedPath(undefined);
      })
      .catch((e: unknown) => setError(String(e)));
  }

  const onFetch = useEffectEvent(() => void fetchCapture());

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-initialize-state -- editor fetches the capture on window open
    onFetch();

    const unlisten = listen('refresh-capture', () => {
      onFetch();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape') {
        e.preventDefault();
        void hideImageEditor();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      void unlisten.then((u) => u());
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // The decoded data URL is the working source, so size controls track the
  // image's real pixels rather than the (possibly larger) original capture.
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setBase({ width: img.naturalWidth, height: img.naturalHeight });
    setWidth(img.naturalWidth);
    setHeight(img.naturalHeight);
  }

  function changeWidth(next: number) {
    const w = clampDimension(next);
    setWidth(w);
    if (lockAspect && base) {
      setHeight(clampDimension((w * base.height) / base.width));
    }
    setSave('idle');
  }

  function changeHeight(next: number) {
    const h = clampDimension(next);
    setHeight(h);
    if (lockAspect && base) {
      setWidth(clampDimension((h * base.width) / base.height));
    }
    setSave('idle');
  }

  function applyScale(scale: number) {
    if (!base) return;
    setWidth(clampDimension(base.width * scale));
    setHeight(clampDimension(base.height * scale));
    setSave('idle');
  }

  function reset() {
    if (!base) return;
    setWidth(base.width);
    setHeight(base.height);
    setSave('idle');
  }

  async function onSave() {
    const img = imgRef.current;
    if (!img || !base || save === 'busy') return;
    setSave('busy');
    setError(undefined);
    try {
      const dest = document.createElement('canvas');
      dest.width = width;
      dest.height = height;
      await pica.resize(img, dest, { filter: 'lanczos3' });
      const blob = await pica.toBlob(dest, 'image/png');
      const dataUrl = await blobToDataUrl(blob);
      const path = await saveEditedCaptureToDesktop(dataUrl);
      setSavedPath(path);
      setSave('success');
    } catch (e) {
      setSave('idle');
      setError(String(e));
    }
  }

  const unchanged = !!base && width === base.width && height === base.height;

  return (
    <div className="image-editor-root">
      <div className="image-editor-header" data-tauri-drag-region>
        <span className="image-editor-title">Edit capture</span>
        <button
          type="button"
          onClick={() => void hideImageEditor()}
          className="image-editor-close"
          aria-label="Close editor"
        >
          <X aria-hidden size={16} />
        </button>
      </div>

      <div className="image-editor-body">
        <div className="image-editor-stage">
          {error ? <p className="image-editor-error">{error}</p> : null}
          {src ? (
            <img
              ref={imgRef}
              src={src}
              alt="Capture to edit"
              draggable={false}
              onLoad={onImageLoad}
              className="image-editor-preview"
            />
          ) : null}
        </div>

        <div className="image-editor-panel">
          <h2 className="image-editor-section">Resize</h2>

          <label className="image-editor-field">
            <span>Width</span>
            <div className="image-editor-input-wrap">
              <input
                type="number"
                min={1}
                value={width || ''}
                onChange={(e) => changeWidth(e.currentTarget.valueAsNumber)}
                className="image-editor-input"
              />
              <span className="image-editor-unit">px</span>
            </div>
          </label>

          <label className="image-editor-field">
            <span>Height</span>
            <div className="image-editor-input-wrap">
              <input
                type="number"
                min={1}
                value={height || ''}
                onChange={(e) => changeHeight(e.currentTarget.valueAsNumber)}
                className="image-editor-input"
              />
              <span className="image-editor-unit">px</span>
            </div>
          </label>

          <button
            type="button"
            onClick={() => setLockAspect((v) => !v)}
            className="image-editor-lock"
            aria-pressed={lockAspect}
          >
            {lockAspect ? (
              <Lock aria-hidden size={14} />
            ) : (
              <Unlock aria-hidden size={14} />
            )}
            {lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
          </button>

          <div className="image-editor-presets">
            {SCALE_PRESETS.map((scale) => (
              <button
                key={scale}
                type="button"
                disabled={!base}
                onClick={() => applyScale(scale)}
                className="image-editor-preset"
              >
                {scale * 100}%
              </button>
            ))}
          </div>

          <div className="image-editor-spacer" />

          {savedPath ? (
            <p className="image-editor-saved">Saved to Desktop</p>
          ) : null}

          <div className="image-editor-actions">
            <button
              type="button"
              onClick={reset}
              disabled={!base || unchanged}
              className="image-editor-btn image-editor-btn-ghost"
            >
              <RotateCcw aria-hidden size={14} />
              Reset
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!base || save === 'busy'}
              className="image-editor-btn image-editor-btn-primary"
            >
              {save === 'success' ? (
                <Check aria-hidden size={14} />
              ) : (
                <Save aria-hidden size={14} />
              )}
              {save === 'success'
                ? 'Saved'
                : save === 'busy'
                  ? 'Saving…'
                  : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
