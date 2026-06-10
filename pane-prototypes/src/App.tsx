import { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './mock/store';
import { GlobalSwitcher, ToastViewport } from './shared/Chrome';
import { Launcher } from './launcher/Launcher';
import { PROTOTYPES } from './prototypes/registry';

function Fallback() {
  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        color: '#6b6b73',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--t-sm)',
      }}
    >
      loading prototype…
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/" element={<Launcher />} />
            {PROTOTYPES.map((p) => {
              const C = p.Component;
              return <Route key={p.id} path={`/p/${p.slug}/*`} element={<C />} />;
            })}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <GlobalSwitcher />
        <ToastViewport />
      </HashRouter>
    </StoreProvider>
  );
}
