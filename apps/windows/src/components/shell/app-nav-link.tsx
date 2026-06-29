import { Link } from '@tanstack/react-router';
import { Text } from 'pickle-ui';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function AppNavLink({
  to,
  active,
  icon: Icon,
  label,
}: {
  to: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm no-underline transition-[background-color,color] duration-120 ease-in-out max-md:min-w-max md:min-w-0',
        active
          ? 'bg-[var(--app-white-10)] text-foreground'
          : 'text-[var(--app-foreground-subtle)] hover:bg-[var(--app-white-08)] hover:text-foreground',
      )}
    >
      <Icon aria-hidden size={16} />
      <Text as="span">{label}</Text>
    </Link>
  );
}
