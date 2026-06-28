import { useEffect } from 'react';
import { AlertTriangleIcon, CameraIcon, MinusIcon, XIcon } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { APP_DISPLAY_NAME } from '@/lib/app-name';
import { revealMainWindow } from '@/lib/reveal-main-window';

/**
 * Last-resort failure UI. Rendered with plain DOM + shell.css/global.css classes
 * only — never framework components — so it still renders correctly when the
 * generated UI stylesheet is missing or invalid.
 */
export function AppBootFailure({
  title = "Couldn't start Pane",
  message,
}: {
  title?: string;
  message: string;
}) {
  useEffect(() => {
    void revealMainWindow().catch(console.error);
  }, []);

  return (
    <div role="alert" className="app-boot-failure">
      <div
        className="app-titlebar"
        data-tauri-drag-region
        role="presentation"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest('button')) return;
          void getCurrentWindow().startDragging().catch(console.error);
        }}
      >
        <div className="app-titlebar-left" data-tauri-drag-region>
          <span className="app-titlebar-icon" data-tauri-drag-region>
            <CameraIcon aria-hidden size={12} />
          </span>
          <span className="app-titlebar-title" data-tauri-drag-region>
            {APP_DISPLAY_NAME}
          </span>
        </div>

        <div className="app-titlebar-controls">
          <button
            aria-label="Minimize"
            className="app-window-control"
            type="button"
            onClick={() =>
              void getCurrentWindow().minimize().catch(console.error)
            }
          >
            <MinusIcon aria-hidden size={14} />
          </button>
          <button
            aria-label="Close to tray"
            className="app-window-control app-window-control-close"
            type="button"
            onClick={() => void getCurrentWindow().hide().catch(console.error)}
          >
            <XIcon aria-hidden size={14} />
          </button>
        </div>
      </div>

      <div className="app-boot-failure-body">
        <div className="app-boot-failure-card">
          <AlertTriangleIcon
            aria-hidden
            color="var(--app-destructive)"
            size={18}
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <div className="app-boot-failure-text">
            <p className="app-boot-failure-title">{title}</p>
            <p className="app-boot-failure-message">{message}</p>
            <p className="app-boot-failure-hint">
              Close Pane from the window controls or system tray, then try
              again.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
