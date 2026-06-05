import { Redirect, useLocalSearchParams } from 'expo-router';

// Legacy `?view=` redirects only (old URLs). Rust opens child webviews via
// `child_webview_url` direct paths — see `apps/windows/tauri/src/child_webview_url.rs`.
export default function Index() {
  const { view, chars } = useLocalSearchParams<{
    view?: string;
    chars?: string;
  }>();

  if (view === 'accent-popup') {
    const href = chars
      ? `/accent-popup?chars=${encodeURIComponent(chars)}`
      : '/accent-popup';
    return <Redirect href={href} />;
  }
  if (view === 'area-selector') return <Redirect href="/area-selector" />;
  if (view === 'preview') return <Redirect href="/preview" />;

  return <Redirect href="/capture" />;
}
