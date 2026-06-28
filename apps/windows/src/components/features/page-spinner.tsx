import { Loader2Icon } from 'lucide-react';

export function PageSpinner() {
  return (
    <output
      aria-label="Loading"
      className="flex min-h-70 items-center justify-center"
    >
      <Loader2Icon
        aria-hidden
        className="animate-spin text-muted-foreground"
        size={20}
      />
    </output>
  );
}
