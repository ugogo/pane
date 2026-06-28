import { CameraIcon, MinusIcon, SquareIcon, XIcon } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Text } from 'pickle-ui';
import { ShellSurface } from '@/components/shell/shell-surface';
import { WindowControl } from '@/components/shell/window-control';
import { APP_DISPLAY_NAME } from '@/lib/app-name';
import { startWindowDrag } from '@/lib/start-window-drag';

export function AppTitlebar() {
  return (
    <ShellSurface
      className="relative z-10 flex h-9 select-none items-center border-b border-border shadow-[inset_0_1px_0_var(--app-white-08),inset_0_-1px_0_var(--app-black-20)]"
      data-tauri-drag-region
      role="presentation"
      onMouseDown={startWindowDrag}
    >
      <div
        className="flex min-w-0 items-center gap-2 px-3"
        data-tauri-drag-region
      >
        <span
          className="flex size-4 items-center justify-center rounded bg-primary text-primary-foreground"
          data-tauri-drag-region
        >
          <CameraIcon aria-hidden size={12} />
        </span>
        <span
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--app-foreground-soft)]"
          data-tauri-drag-region
        >
          <Text as="span" variant="small">
            {APP_DISPLAY_NAME}
          </Text>
        </span>
      </div>
      <div className="ml-auto flex h-full">
        <WindowControl
          aria-label="Minimize"
          onClick={() =>
            void getCurrentWindow().minimize().catch(console.error)
          }
        >
          <MinusIcon aria-hidden size={14} />
        </WindowControl>
        <WindowControl
          aria-label="Maximize or restore"
          onClick={() =>
            void getCurrentWindow().toggleMaximize().catch(console.error)
          }
        >
          <SquareIcon aria-hidden size={12} />
        </WindowControl>
        <WindowControl
          aria-label="Close to tray"
          variant="close"
          onClick={() => void getCurrentWindow().hide().catch(console.error)}
        >
          <XIcon aria-hidden size={14} />
        </WindowControl>
      </div>
    </ShellSurface>
  );
}
