import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { App } from './App';
import { AccentPopup } from './views/AccentPopup';
import { AreaSelector } from './views/AreaSelector';
import { CapturePreview } from './views/CapturePreview';
import { DesignSystem } from './views/DesignSystem';
import './styles.css';

function resolveView() {
  const view = new URL(window.location.href).searchParams.get('view');
  switch (view) {
    case 'accent-popup':
      return <AccentPopup />;
    case 'area-selector':
      return <AreaSelector />;
    case 'preview':
      return <CapturePreview />;
    // Dev-only component gallery. Gated so it never ships in a release build;
    // falls through to the app in production.
    case 'design':
      return import.meta.env.DEV ? <DesignSystem /> : <App />;
    default:
      return <App />;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{resolveView()}</React.StrictMode>,
);

if (!new URL(window.location.href).searchParams.has('view')) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void getCurrentWindow().show().catch(console.error);
    });
  });
}
