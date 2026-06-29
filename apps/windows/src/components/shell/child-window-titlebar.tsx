import type { ReactNode } from 'react';
import { WindowControl } from '@/components/shell/window-control';
import { startWindowDrag } from '@/lib/start-window-drag';

export function ChildWindowTitlebar({
  title,
  closeLabel,
  onClose,
  closeIcon,
}: {
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  closeIcon: ReactNode;
}) {
  return (
    <div
      className="flex h-9 shrink-0 items-center border-b border-border pl-3.5"
      data-tauri-drag-region
      role="presentation"
      onMouseDown={startWindowDrag}
    >
      {title}
      <div className="ml-auto flex h-full shrink-0">
        <WindowControl
          aria-label={closeLabel}
          variant="close"
          className="[&_svg]:size-4"
          onClick={onClose}
        >
          {closeIcon}
        </WindowControl>
      </div>
    </div>
  );
}
