import { Redirect, useLocalSearchParams } from 'expo-router';

// Redirect to the appropriate route. Handles backward-compat with the old
// `?view=` query-param scheme used by the Tauri Rust backend to open popup
// windows. New Rust code should open direct routes (/accent-popup, etc.)
// instead.
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
