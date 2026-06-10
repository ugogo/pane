import { lazy, type LazyExoticComponent, type ComponentType } from 'react';

export interface PrototypeMeta {
  id: string;
  slug: string; // route segment under /p/
  index: number; // 1..5 for Ctrl+N
  name: string;
  tagline: string;
  inspiration: string;
  accent: string;
  Component: LazyExoticComponent<ComponentType>;
}

export const PROTOTYPES: PrototypeMeta[] = [
  {
    id: 'command-first',
    slug: 'command',
    index: 1,
    name: 'Command-first',
    tagline: 'The palette is the product. Keyboard-driven, dense, instant.',
    inspiration: 'Raycast',
    accent: '#7c5cff',
    Component: lazy(() => import('./command-first/App')),
  },
  {
    id: 'settings-spacious',
    slug: 'settings',
    index: 2,
    name: 'Settings-spacious',
    tagline: 'Sidebar + roomy panes, soft grouped cards, light & dark.',
    inspiration: 'Apple System Settings',
    accent: '#0a84ff',
    Component: lazy(() => import('./settings-spacious/App')),
  },
  {
    id: 'terminal-calm',
    slug: 'terminal',
    index: 3,
    name: 'Terminal-calm',
    tagline: 'Monospace-forward, high contrast, typography does the work.',
    inspiration: 'OpenAI Codex',
    accent: '#27d3a2',
    Component: lazy(() => import('./terminal-calm/App')),
  },
  {
    id: 'terminal-body',
    slug: 'terminal-sans-body',
    index: 4,
    name: 'Terminal · sans body',
    tagline: 'Prototype 3, but Geist sans carries body copy; mono for data.',
    inspiration: 'Codex × Geist',
    accent: '#27d3a2',
    Component: lazy(() => import('./terminal-body/App')),
  },
  {
    id: 'terminal-head',
    slug: 'terminal-sans-head',
    index: 5,
    name: 'Terminal · sans headings',
    tagline: 'Prototype 3, but Geist sans for headings; mono everywhere else.',
    inspiration: 'Codex × Geist',
    accent: '#27d3a2',
    Component: lazy(() => import('./terminal-head/App')),
  },
  {
    id: 'glance-dashboard',
    slug: 'glance',
    index: 6,
    name: 'Glance dashboard',
    tagline: 'One spatial surface of live tiles you operate in place.',
    inspiration: 'Control Center',
    accent: '#ff6b9d',
    Component: lazy(() => import('./glance-dashboard/App')),
  },
  {
    id: 'companion-compact',
    slug: 'companion',
    index: 7,
    name: 'Companion-led',
    tagline: 'Touch-friendly, bottom-nav, big targets — a phone vision.',
    inspiration: 'iOS',
    accent: '#ff9f0a',
    Component: lazy(() => import('./companion-compact/App')),
  },
];

export function protoByIndex(i: number): PrototypeMeta | undefined {
  return PROTOTYPES.find((p) => p.index === i);
}
