// The Pane brand mark — the app's favicon artwork, used as the canonical logo.
export function PaneMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/favicon.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
      style={{ display: 'block' }}
    />
  );
}
