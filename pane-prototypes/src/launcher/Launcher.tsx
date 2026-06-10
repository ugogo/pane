import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Command } from 'lucide-react';
import { PROTOTYPES } from '../prototypes/registry';
import './launcher.css';

const FEATURES = [
  'Capture',
  'Display',
  'Sound',
  'Lights',
  'Accents',
  'Hotkeys',
  'Command Palette',
  'System',
  'Companion',
  'Diagnostics',
];

export function Launcher() {
  const navigate = useNavigate();
  return (
    <div className="launcher">
      <div className="launcher__inner">
        <header className="launcher__head">
          <div className="launcher__brandrow">
            <div className="launcher__logo">
              <Command size={18} />
            </div>
            <span className="launcher__brand">Pane</span>
            <span className="launcher__tag">design prototypes</span>
          </div>
          <h1 className="launcher__title">Five directions for one control center.</h1>
          <p className="launcher__lede">
            A single tray app that consolidates screen capture, display control, sound, RGB
            lighting, and system shortcuts. Each prototype reimagines the same ten feature areas —
            the through-line is typography and spacing discipline.
          </p>
          <div className="launcher__features">
            {FEATURES.map((f) => (
              <span key={f} className="launcher__chip">
                {f}
              </span>
            ))}
          </div>
        </header>

        <div className="launcher__grid">
          {PROTOTYPES.map((p) => (
            <button
              key={p.id}
              className="proto-card"
              style={{ ['--accent' as string]: p.accent }}
              onClick={() => navigate(`/p/${p.slug}`)}
            >
              <div className="proto-card__top">
                <span className="proto-card__num">0{p.index}</span>
                <span className="proto-card__insp">after {p.inspiration}</span>
                <ArrowUpRight className="proto-card__arrow" size={18} />
              </div>
              <div className="proto-card__preview" aria-hidden>
                <Preview id={p.id} />
              </div>
              <div className="proto-card__body">
                <h2 className="proto-card__name">{p.name}</h2>
                <p className="proto-card__tagline">{p.tagline}</p>
              </div>
              <div className="proto-card__foot">
                <span className="proto-card__kbd">⌘{p.index}</span>
                <span>Open prototype</span>
              </div>
            </button>
          ))}
        </div>

        <footer className="launcher__foot">
          <span>Jump anytime with ⌘/Ctrl + 1–5 · ⌘/Ctrl + 0 for this launcher.</span>
          <span className="launcher__foot-mono">npm run dev · mock data · no backend</span>
        </footer>
      </div>
    </div>
  );
}

// Tiny abstract previews hinting at each prototype's layout language.
function Preview({ id }: { id: string }) {
  switch (id) {
    case 'command-first':
      return (
        <div className="pv pv--command">
          <div className="pv-bar" />
          {[80, 60, 70, 50].map((w, i) => (
            <div key={i} className="pv-row" style={{ width: `${w}%` }} />
          ))}
        </div>
      );
    case 'settings-spacious':
      return (
        <div className="pv pv--settings">
          <div className="pv-side" />
          <div className="pv-main">
            <div className="pv-card" />
            <div className="pv-card" />
          </div>
        </div>
      );
    case 'terminal-calm':
      return (
        <div className="pv pv--terminal">
          {['$ pane lights apply aurora', '  ✓ 3 sources · screen-sync', '$ pane display night', '  ✓ ok'].map(
            (t, i) => (
              <div key={i} className="pv-line">
                {t}
              </div>
            ),
          )}
        </div>
      );
    case 'glance-dashboard':
      return (
        <div className="pv pv--glance">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pv-tile" />
          ))}
        </div>
      );
    case 'companion-compact':
      return (
        <div className="pv pv--companion">
          <div className="pv-phone">
            <div className="pv-phone__card" />
            <div className="pv-phone__card" />
            <div className="pv-phone__nav" />
          </div>
        </div>
      );
    default:
      return null;
  }
}
