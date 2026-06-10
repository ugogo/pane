import { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  Command,
  Keyboard,
  Lightbulb,
  Monitor,
  Power,
  Search,
  Settings2,
  Smartphone,
  Type,
  Volume2,
} from 'lucide-react';
import { useActions, usePane } from '../../mock/store';
import type { AreaKey } from '../../mock/commands';
import { CommandPalette } from '../../shared/CommandPalette';
import { CaptureOverlay } from '../../shared/CaptureOverlay';
import { AccentsPlayground } from '../../shared/AccentsPlayground';
import { useCaptureFlow } from '../../shared/capture';
import { useHotkeys, useChordCapture, formatChord } from '../../shared/keys';
import { usePersistentState } from '../../shared/usePersistentState';
import type { Hotkey } from '../../mock/types';
import './styles.css';

const ACCENT = '#7c5cff';

const NAV: { area: AreaKey; label: string; icon: typeof Camera; hint: string }[] = [
  { area: 'capture', label: 'Capture', icon: Camera, hint: '⇧3' },
  { area: 'display', label: 'Display', icon: Monitor, hint: 'd' },
  { area: 'sound', label: 'Sound', icon: Volume2, hint: 's' },
  { area: 'lights', label: 'Lights', icon: Lightbulb, hint: 'l' },
  { area: 'accents', label: 'Accents', icon: Type, hint: 'a' },
  { area: 'hotkeys', label: 'Hotkeys', icon: Keyboard, hint: 'h' },
  { area: 'system', label: 'System', icon: Settings2, hint: 'y' },
  { area: 'companion', label: 'Companion', icon: Smartphone, hint: 'c' },
  { area: 'diagnostics', label: 'Diagnostics', icon: Activity, hint: 'g' },
];

export default function CommandFirstApp() {
  const [page, setPage] = usePersistentState<AreaKey>('cf:page', 'capture');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const flow = useCaptureFlow();

  const goto = useCallback((area: AreaKey) => setPage(area), [setPage]);
  const startCapture = useCallback((mode: 'fullscreen' | 'area') => flow.choose(mode), [flow]);

  useHotkeys(
    {
      'mod+k': (e) => {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      },
    },
    [],
  );

  return (
    <div className="cf">
      <aside className="cf__rail">
        <div className="cf__brand">
          <div className="cf__logo">
            <Command size={15} />
          </div>
          <span className="cf__brandname">Pane</span>
        </div>
        <button className="cf__omni" onClick={() => setPaletteOpen(true)}>
          <Search size={14} />
          <span>Search actions…</span>
          <kbd>⌘K</kbd>
        </button>
        <nav className="cf__nav">
          {NAV.map((n) => (
            <button
              key={n.area}
              className="cf__navitem"
              data-active={page === n.area}
              onClick={() => setPage(n.area)}
            >
              <n.icon size={15} />
              <span>{n.label}</span>
              <kbd>{n.hint}</kbd>
            </button>
          ))}
        </nav>
        <div className="cf__railfoot">
          <span className="cf__dot" /> mock state · live
        </div>
      </aside>

      <main className="cf__main">
        <Page page={page} flow={flow} goto={goto} />
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        goto={goto}
        startCapture={startCapture}
        accent={ACCENT}
      />
      <CaptureOverlay flow={flow} accent={ACCENT} />
    </div>
  );
}

function Page({
  page,
  flow,
  goto,
}: {
  page: AreaKey;
  flow: ReturnType<typeof useCaptureFlow>;
  goto: (a: AreaKey) => void;
}) {
  switch (page) {
    case 'capture':
      return <CapturePage flow={flow} />;
    case 'display':
      return <DisplayPage />;
    case 'sound':
      return <SoundPage />;
    case 'lights':
      return <LightsPage />;
    case 'accents':
      return <AccentsPage />;
    case 'hotkeys':
      return <HotkeysPage />;
    case 'system':
      return <SystemPage goto={goto} />;
    case 'companion':
      return <CompanionPage />;
    case 'diagnostics':
      return <DiagnosticsPage />;
  }
}

// ---------- shared local controls ----------
function Header({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <header className="cf__header">
      <div>
        <h1 className="cf__title">{title}</h1>
        <p className="cf__sub">{sub}</p>
      </div>
      {action}
    </header>
  );
}

function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  unit = '%',
  tint = ACCENT,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  tint?: string;
}) {
  return (
    <div className="cf__slider">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        style={{ ['--tint' as string]: tint, ['--pct' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className="cf__sliderval tnum">
        {value}
        {unit}
      </span>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className="cf__toggle" data-on={on} onClick={onClick} role="switch" aria-checked={on}>
      <span className="cf__toggleknob" />
    </button>
  );
}

// ---------- Capture ----------
function CapturePage({ flow }: { flow: ReturnType<typeof useCaptureFlow> }) {
  const { captures } = usePane();
  return (
    <>
      <Header
        title="Capture"
        sub="Fullscreen or region — copy, save, edit, enlarge."
        action={
          <button className="cf__primary" onClick={() => flow.start()}>
            <Camera size={15} /> New capture
          </button>
        }
      />
      <div className="cf__captgrid">
        <button className="cf__captcard" onClick={() => flow.choose('fullscreen')}>
          <Monitor size={22} />
          <span className="cf__captname">Fullscreen</span>
          <span className="cf__captmeta">Ctrl ⇧ 3</span>
        </button>
        <button className="cf__captcard" onClick={() => flow.choose('area')}>
          <Camera size={22} />
          <span className="cf__captname">Select area</span>
          <span className="cf__captmeta">Ctrl ⇧ 4</span>
        </button>
      </div>

      <div className="cf__sectionlabel">Recent captures</div>
      {captures.length === 0 ? (
        <div className="cf__empty">
          No captures yet. Press <kbd>Ctrl ⇧ 4</kbd> or run a capture above.
        </div>
      ) : (
        <ul className="cf__list">
          {captures.map((c) => (
            <li key={c.id} className="cf__row">
              <span
                className="cf__thumb"
                style={{ background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]}, ${c.gradient[2]})` }}
              />
              <span className="cf__rowmain">
                <span className="cf__rowtitle">{c.mode === 'area' ? 'Area capture' : 'Fullscreen capture'}</span>
                <span className="cf__rowmeta">
                  {c.region ? `${c.region.w}×${c.region.h}px` : '3840×2160px'} ·{' '}
                  {new Date(c.createdAt).toLocaleTimeString()}
                </span>
              </span>
              <span className="cf__rowtag">{c.savedPath ? 'saved' : 'in memory'}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------- Display ----------
function DisplayPage() {
  const { monitors, displayPresets, activeDisplayPresetId } = usePane();
  const actions = useActions();
  return (
    <>
      <Header
        title="Display"
        sub="Per-monitor DDC/CI brightness, contrast and RGB gain."
        action={
          <button className="cf__ghost" onClick={() => actions.saveDisplayPreset(`Preset ${displayPresets.length + 1}`)}>
            Save current as preset
          </button>
        }
      />
      <div className="cf__chips">
        {displayPresets.map((p) => (
          <button
            key={p.id}
            className="cf__chip"
            data-active={activeDisplayPresetId === p.id}
            onClick={() => actions.applyDisplayPreset(p.id)}
            title={p.description}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="cf__stack">
        {monitors.map((m) => (
          <div key={m.id} className="cf__panel">
            <div className="cf__panelhead">
              <div>
                <span className="cf__paneltitle">
                  {m.name} {m.primary && <span className="cf__badge">primary</span>}
                </span>
                <span className="cf__panelmeta">
                  {m.model} · {m.resolution} · {m.refreshHz}Hz · {m.ddc ? 'DDC/CI' : 'no DDC'}
                </span>
              </div>
            </div>
            {m.ddc ? (
              <div className="cf__controls">
                <Field label="Brightness">
                  <Slider value={m.brightness} onChange={(v) => actions.setMonitor(m.id, { brightness: v })} />
                </Field>
                <Field label="Contrast">
                  <Slider value={m.contrast} onChange={(v) => actions.setMonitor(m.id, { contrast: v })} />
                </Field>
                <Field label="Red">
                  <Slider value={m.gain.r} tint="#ff5f57" onChange={(v) => actions.setGain(m.id, 'r', v)} />
                </Field>
                <Field label="Green">
                  <Slider value={m.gain.g} tint="#28c840" onChange={(v) => actions.setGain(m.id, 'g', v)} />
                </Field>
                <Field label="Blue">
                  <Slider value={m.gain.b} tint="#4cc9ff" onChange={(v) => actions.setGain(m.id, 'b', v)} />
                </Field>
              </div>
            ) : (
              <div className="cf__warn">This display doesn’t expose DDC/CI — software control unavailable.</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cf__field">
      <span className="cf__fieldlabel">{label}</span>
      {children}
    </div>
  );
}

// ---------- Sound ----------
function SoundPage() {
  const { sound } = usePane();
  const actions = useActions();
  const outputs = sound.devices.filter((d) => d.kind === 'output');
  const inputs = sound.devices.filter((d) => d.kind === 'input');
  return (
    <>
      <Header title="Sound" sub="Default devices, levels and mute." />
      <div className="cf__stack">
        <div className="cf__panel">
          <span className="cf__paneltitle">Output</span>
          <select
            className="cf__select"
            value={sound.outputDeviceId}
            onChange={(e) => actions.setSound({ outputDeviceId: e.target.value })}
          >
            {outputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="cf__sliderrow">
            <Slider value={sound.outputVolume} onChange={(v) => actions.setSound({ outputVolume: v, outputMuted: false })} />
            <Toggle on={sound.outputMuted} onClick={() => actions.toggleMute('output')} />
            <span className="cf__mutelabel">{sound.outputMuted ? 'muted' : 'mute'}</span>
          </div>
        </div>
        <div className="cf__panel">
          <span className="cf__paneltitle">Input</span>
          <select
            className="cf__select"
            value={sound.inputDeviceId}
            onChange={(e) => actions.setSound({ inputDeviceId: e.target.value })}
          >
            {inputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="cf__sliderrow">
            <Slider value={sound.inputVolume} tint="#27d3a2" onChange={(v) => actions.setSound({ inputVolume: v, inputMuted: false })} />
            <Toggle on={sound.inputMuted} onClick={() => actions.toggleMute('input')} />
            <span className="cf__mutelabel">{sound.inputMuted ? 'muted' : 'mute'}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- Lights ----------
function LightsPage() {
  const { lights, ambient, lightPresets, activeLightPresetId, monitors } = usePane();
  const actions = useActions();
  return (
    <>
      <Header
        title="Lights"
        sub="ARGB sources, ambient screen-sync and presets."
        action={
          <div className="cf__btnrow">
            <button className="cf__ghost" onClick={() => actions.restoreLights()}>Restore</button>
            <button className="cf__ghost" onClick={() => actions.allLightsOff()}>All off</button>
          </div>
        }
      />
      <div className="cf__chips">
        {lightPresets.map((p) => (
          <button
            key={p.id}
            className="cf__chip"
            data-active={activeLightPresetId === p.id}
            onClick={() => actions.applyLightPreset(p.id)}
          >
            <span className="cf__chipdot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="cf__panel cf__panel--accent">
        <div className="cf__panelhead">
          <div>
            <span className="cf__paneltitle">Ambient screen-sync</span>
            <span className="cf__panelmeta">Sampling {monitors.find((m) => m.id === ambient.sourceMonitorId)?.name}</span>
          </div>
          <Toggle on={ambient.enabled} onClick={() => actions.setAmbient({ enabled: !ambient.enabled })} />
        </div>
        <div className="cf__controls" data-dim={!ambient.enabled}>
          <Field label="Brightness"><Slider value={ambient.brightness} onChange={(v) => actions.setAmbient({ brightness: v })} /></Field>
          <Field label="Saturation"><Slider value={ambient.saturation} tint="#ff6b9d" onChange={(v) => actions.setAmbient({ saturation: v })} /></Field>
          <Field label="Warmth"><Slider value={ambient.warmth} tint="#ffb020" onChange={(v) => actions.setAmbient({ warmth: v })} /></Field>
          <Field label="Zones"><Slider value={ambient.zones} min={4} max={32} unit="" tint="#27d3a2" onChange={(v) => actions.setAmbient({ zones: v })} /></Field>
          <Field label="Capture FPS"><Slider value={ambient.fps} min={10} max={60} unit="fps" tint="#4cc9ff" onChange={(v) => actions.setAmbient({ fps: v })} /></Field>
        </div>
      </div>

      <div className="cf__sectionlabel">Sources</div>
      <ul className="cf__list">
        {lights.map((l) => (
          <li key={l.id} className="cf__row" data-off={!l.on || !l.connected}>
            <span className="cf__lightdot" style={{ background: l.on && l.connected ? l.color : '#3a3a40', boxShadow: l.on && l.connected ? `0 0 12px ${l.color}` : 'none' }} />
            <span className="cf__rowmain">
              <span className="cf__rowtitle">{l.name}</span>
              <span className="cf__rowmeta">{l.vendor} · {l.ledCount} LEDs · {l.effect}{!l.connected && ' · disconnected'}</span>
            </span>
            <input
              type="color"
              className="cf__colorinput"
              value={l.color}
              disabled={!l.connected}
              onChange={(e) => actions.setLight(l.id, { color: e.target.value })}
            />
            <div className="cf__rowslider">
              <Slider value={l.brightness} tint={l.color} onChange={(v) => actions.setLight(l.id, { brightness: v })} />
            </div>
            <Toggle on={l.on} onClick={() => actions.toggleLight(l.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Accents ----------
function AccentsPage() {
  const { accents } = usePane();
  const actions = useActions();
  return (
    <>
      <Header
        title="Accents"
        sub="Hold a key for diacritics — à â ä, è é ê, ñ, ç …"
        action={<Toggle on={accents.enabled} onClick={() => actions.toggleAccents()} />}
      />
      <div className="cf__panel">
        <span className="cf__paneltitle">Try it</span>
        <span className="cf__panelmeta">Type a word, then press-and-hold a vowel. Pick a variant with 1–6.</span>
        <AccentsPlayground accent={ACCENT} />
      </div>
      <div className="cf__panel">
        <div className="cf__panelhead">
          <span className="cf__paneltitle">Long-press delay</span>
          <span className="cf__rowmeta tnum">{accents.holdMs}ms</span>
        </div>
        <Slider value={accents.holdMs} min={120} max={600} unit="ms" onChange={(v) => actions.setAccents({ holdMs: v })} />
        <div className="cf__accentmap">
          {Object.entries(accents.map).map(([base, vs]) => (
            <div key={base} className="cf__accentkey">
              <span className="cf__accentbase">{base}</span>
              <span className="cf__accentvars">{vs.join(' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- Hotkeys ----------
function HotkeysPage() {
  const { hotkeys, remaps } = usePane();
  const actions = useActions();

  // detect conflicts (same enabled chord)
  const conflicts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const h of hotkeys) {
      if (!h.enabled) continue;
      const k = h.chord.join('+');
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [hotkeys]);

  return (
    <>
      <Header title="Hotkeys" sub="Global shortcuts and key remaps. Click a chord to rebind." />
      <div className="cf__sectionlabel">Global shortcuts</div>
      <ul className="cf__list">
        {hotkeys.map((h) => (
          <HotkeyRow key={h.id} h={h} conflict={h.enabled && conflicts.has(h.chord.join('+'))} />
        ))}
      </ul>

      <div className="cf__sectionlabel">Key remaps</div>
      <ul className="cf__list">
        {remaps.map((r) => (
          <li key={r.id} className="cf__row">
            <span className="cf__rowmain">
              <span className="cf__rowtitle">
                <span className="cf__keys">{formatChord(r.from, ' + ')}</span>
                <span className="cf__arrow">→</span>
                <span className="cf__keys">{formatChord(r.to, ' + ')}</span>
              </span>
            </span>
            <Toggle on={r.enabled} onClick={() => actions.updateRemap(r.id, { enabled: !r.enabled })} />
            <button className="cf__rowx" onClick={() => actions.removeRemap(r.id)}>remove</button>
          </li>
        ))}
      </ul>
      <button className="cf__ghost" onClick={() => actions.addRemap(['Alt', 'C'], ['Ctrl', 'C'])}>+ Add remap (Alt+C → Ctrl+C)</button>
    </>
  );
}

function HotkeyRow({ h, conflict }: { h: Hotkey; conflict: boolean }) {
  const actions = useActions();
  const { capturing, draft, start } = useChordCapture((chord) => actions.setHotkeyChord(h.id, chord));
  return (
    <li className="cf__row" data-off={!h.enabled}>
      <span className="cf__rowmain">
        <span className="cf__rowtitle">{h.label}</span>
        {conflict && <span className="cf__conflict">conflict</span>}
      </span>
      <button className="cf__chord" data-capturing={capturing} onClick={start}>
        {capturing ? draft.length ? formatChord(draft, ' ') : 'Press keys…' : formatChord(h.chord, ' ')}
      </button>
      <Toggle on={h.enabled} onClick={() => actions.toggleHotkey(h.id)} />
    </li>
  );
}

// ---------- System ----------
function SystemPage({ goto }: { goto: (a: AreaKey) => void }) {
  const { system, diagnostics } = usePane();
  const actions = useActions();
  return (
    <>
      <Header title="System" sub="Startup, power and shortcuts." />
      <ul className="cf__list">
        <li className="cf__row">
          <span className="cf__rowmain">
            <span className="cf__rowtitle">Run at startup</span>
            <span className="cf__rowmeta">Launch Pane when you sign in</span>
          </span>
          <Toggle on={system.runAtStartup} onClick={() => actions.toggleStartup()} />
        </li>
        <li className="cf__row">
          <span className="cf__rowmain">
            <span className="cf__rowtitle">Sleep now</span>
            <span className="cf__rowmeta">Suspend the machine immediately</span>
          </span>
          <button className="cf__ghost" onClick={() => actions.sleepNow()}><Power size={14} /> Sleep</button>
        </li>
        <li className="cf__row cf__row--link" onClick={() => goto('hotkeys')}>
          <span className="cf__rowmain">
            <span className="cf__rowtitle">Hotkeys & remaps</span>
            <span className="cf__rowmeta">Manage global shortcuts →</span>
          </span>
        </li>
      </ul>
      <div className="cf__panelmeta cf__version">Pane {diagnostics.version}</div>
    </>
  );
}

// ---------- Companion ----------
function CompanionPage() {
  const { companions } = usePane();
  const actions = useActions();
  return (
    <>
      <Header
        title="Companion"
        sub="Pair an iPhone to control Pane remotely."
        action={<button className="cf__primary" onClick={() => actions.pairCompanion()}>Pair device</button>}
      />
      <div className="cf__pairrow">
        <div className="cf__qr" aria-hidden>
          <QrMock />
        </div>
        <div>
          <span className="cf__paneltitle">Scan to pair</span>
          <p className="cf__panelmeta" style={{ maxWidth: '32ch' }}>
            Open the Pane companion app and scan this code. Pairing is end-to-end encrypted; the
            code rotates every 60 seconds.
          </p>
        </div>
      </div>
      <div className="cf__sectionlabel">Paired devices</div>
      <ul className="cf__list">
        {companions.map((d) => (
          <li key={d.id} className="cf__row">
            <span className="cf__statusdot" data-on={d.online} />
            <span className="cf__rowmain">
              <span className="cf__rowtitle">{d.name}</span>
              <span className="cf__rowmeta">{d.model} · {d.online ? 'online' : `last seen ${d.lastSeen}`}</span>
            </span>
            <button className="cf__rowx" onClick={() => actions.revokeCompanion(d.id)}>revoke</button>
          </li>
        ))}
      </ul>
    </>
  );
}

function QrMock() {
  // deterministic pseudo-QR
  const cells = Array.from({ length: 144 }, (_, i) => (i * 37 + (i % 7) * 13) % 5 < 2);
  return (
    <div className="cf__qrgrid">
      {cells.map((on, i) => (
        <span key={i} data-on={on} />
      ))}
    </div>
  );
}

// ---------- Diagnostics ----------
function DiagnosticsPage() {
  const { diagnostics } = usePane();
  const d = diagnostics;
  const stats = [
    { k: 'Working set', v: `${d.workingSetMB} MB` },
    { k: 'Peak working set', v: `${d.peakWorkingSetMB} MB` },
    { k: 'Startup time', v: `${d.startupMs} ms` },
    { k: 'Process ID', v: `${d.pid}` },
    { k: 'Uptime', v: `${Math.floor(d.uptimeSec / 3600)}h ${Math.floor((d.uptimeSec % 3600) / 60)}m` },
    { k: 'CPU', v: `${d.cpuPercent}%` },
    { k: 'Version', v: d.version },
  ];
  return (
    <>
      <Header title="Diagnostics" sub="Calm telemetry — nothing blinking for no reason." />
      <div className="cf__diaggrid">
        {stats.map((s) => (
          <div key={s.k} className="cf__diagcell">
            <span className="cf__diagk">{s.k}</span>
            <span className="cf__diagv tnum">{s.v}</span>
          </div>
        ))}
      </div>
      <div className="cf__panel">
        <span className="cf__paneltitle">Working set (last 60s)</span>
        <Sparkline />
      </div>
    </>
  );
}

function Sparkline() {
  const pts = Array.from({ length: 40 }, (_, i) => 60 + Math.sin(i / 3) * 8 + (i % 5) * 2);
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const d = pts
    .map((p, i) => `${(i / (pts.length - 1)) * 100},${30 - ((p - min) / (max - min)) * 28}`)
    .join(' ');
  return (
    <svg className="cf__spark" viewBox="0 0 100 30" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke={ACCENT} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
