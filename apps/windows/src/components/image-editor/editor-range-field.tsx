export function EditorRangeField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-1.5 grid grid-cols-[auto_minmax(0,1fr)_42px] items-center gap-2 text-[11px] font-semibold text-muted-foreground [&_output]:text-right [&_output]:text-xs [&_output]:text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
