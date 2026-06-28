import { createFileRoute, redirect } from '@tanstack/react-router';

interface LegacySearch {
  chars?: string;
  view?: string;
}

// Legacy `?view=` redirects only (old URLs). Rust opens child webviews via
// `child_webview_url` direct paths — see `apps/windows/tauri/src/child_webview_url.rs`.
export const Route = createFileRoute('/')({
  validateSearch: (search): LegacySearch => ({
    chars: typeof search.chars === 'string' ? search.chars : undefined,
    view: typeof search.view === 'string' ? search.view : undefined,
  }),
  beforeLoad: ({ search }) => {
    const { view, chars } = search;

    if (view === 'accent-popup') {
      throw redirect({
        to: '/accent-popup',
        search: chars ? { chars } : {},
      });
    }
    if (view === 'area-selector') throw redirect({ to: '/area-selector' });
    if (view === 'preview') throw redirect({ to: '/preview' });
    if (view === 'capture-zoom') throw redirect({ to: '/capture-zoom' });

    throw redirect({ to: '/capture' });
  },
});
