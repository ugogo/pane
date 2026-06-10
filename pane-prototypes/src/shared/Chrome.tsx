import { useLocation, useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { PROTOTYPES } from '../prototypes/registry';
import { useHotkeys } from './keys';
import { dismissToast, useToasts } from './toast';
import './chrome.css';

// Persistent prototype switcher. Ctrl/Cmd+1..5 jump between prototypes,
// Ctrl/Cmd+0 returns to the launcher. Floats bottom-center, quiet until hover.
export function GlobalSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();

  useHotkeys(
    {
      'mod+0': (e) => {
        e.preventDefault();
        navigate('/');
      },
      ...Object.fromEntries(
        PROTOTYPES.map((p) => [
          `mod+${p.index}`,
          (e: KeyboardEvent) => {
            e.preventDefault();
            navigate(`/p/${p.slug}`);
          },
        ]),
      ),
    },
    [navigate],
  );

  const active = PROTOTYPES.find((p) => location.pathname.startsWith(`/p/${p.slug}`));

  return (
    <nav className="switcher" aria-label="Prototype switcher">
      <button className="switcher__home" title="Launcher (⌘0)" onClick={() => navigate('/')}>
        <Home size={15} />
      </button>
      <span className="switcher__sep" />
      {PROTOTYPES.map((p) => (
        <button
          key={p.id}
          className="switcher__dot"
          data-active={active?.id === p.id}
          title={`${p.name} — ${p.tagline}`}
          onClick={() => navigate(`/p/${p.slug}`)}
        >
          <span className="switcher__swatch" style={{ background: p.accent }} />
          <span className="switcher__label">{p.name}</span>
          <span className="switcher__num">{p.index}</span>
        </button>
      ))}
    </nav>
  );
}

export function ToastViewport() {
  const toasts = useToasts();
  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone} onClick={() => dismissToast(t.id)}>
          <span className="toast__bar" />
          <div className="toast__body">
            <div className="toast__msg">{t.message}</div>
            {t.detail && <div className="toast__detail">{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
