import { getCurrentWindow } from '@tauri-apps/api/window';

export function startWindowDrag(event: React.MouseEvent) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest('button')) return;
  void getCurrentWindow().startDragging().catch(console.error);
}
