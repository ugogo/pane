export function EditorSectionHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h2 className="pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </h2>
  );
}
