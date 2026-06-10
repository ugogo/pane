import { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  Command,
  Keyboard,
  Lightbulb,
  Monitor,
  Moon,
  MousePointerSquareDashed,
  Power,
  Search,
  Settings2,
  Smartphone,
  Sun,
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

const ACCENT = '#0a84ff';

type NavEntry = { area: AreaKey; label: string; icon: typeof Camera; tint: string };

const NAV: NavEntry[] = [
  { area: 'capture', label: 'Capture', icon: Camera, tint: '#0a84ff' },
  { area: 'display', label: 'Display', icon: Monitor, tint: '#5e5ce6' },
  { area: 'sound', label: 'Sound', icon: Volume2, tint: '#ff375f' },
  { area: 'lights', label: 'Lights', icon: Lightbulb, tint: '#ff9f0a' },
  { area: 'accents', label: 'Accents', icon: Type, tint: '#30d158' },
  { area: 'hotkeys', label: 'Hotkeys', icon: Keyboard, tint: '#64d2ff' },
  { area: 'system', label: 'System', icon: Settings2, tint: '#8e8e93' },
  { area: 'companion', label: 'Companion', icon: Smartphone, tint: '#bf5af2' },
  { area: 'diagnostics', label: 'Diagnostics', icon: Activity, tint: '#ac8e68' },
];

export default function SettingsSpaciousApp() {
  const [page, setPage] = usePersistentState<AreaKey>('settings:page', 'capture');
  const [theme, setTheme] = usePersistentState<'light' | 'dark'>('settings:theme', 'light');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const flow = useCaptureFlow();

  const goto = useCallback((area: AreaKey) => setPage(area), [setPage]);
  const startCapture = useCallback(
    (mode: 'fullscreen' | 'area') => flow.choose(mode),
    [flow],
  );

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
    <div className="ss" data-theme={theme}>
      <aside className="ss__sidebar">
        <div className="ss__brand">
          <div className="ss__brandmark">
            <Command size={18} />
          </div>
          <div>
            <span className="ss__brandname">Pane</span>
            <span className="ss__brandsub">System Settings</span>
          </div>
        </div>

        <button className="ss__search" onClick={() => setPaletteOpen(true)}>
          <Search size={14} />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>

        <nav className="ss__nav">
          {NAV.map((n) => (
            <button
              key={n.area}
              className="ss__navitem"
              data-active={page === n.area}
              onClick={() => setPage(n.area)}
            >
              <span
                className="ss__navicon"
                style={{ background: page === n.area ? undefined : n.tint }}
              >
                <n.icon size={15} />
              </span>
              <span className="ss__navlabel">{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="ss__sidefoot">
          <button
            className="ss__themetoggle"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? <Sun size={15} /> : <Moon size={15} />}
            <span>Appearance</span>
            <span className="ss__themepill">
              {theme === 'light' ? <Sun size={11} /> : <Moon size={11} />}
              {theme === 'light' ? 'Light' : 'Dark'}
            </span>
          </button>
        </div>
      </aside>

      <main className="ss__detail">
        <div className="ss__detailinner">
          <Page page={page} flow={flow} goto={goto} />
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        goto={goto}
        startCapture={startCapture}
        accent={ACCENT}
        surfaceClass={theme === 'light' ? 'cmdk__surface--light' : undefined}
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
  const meta = NAV.find((n) => n.area === page)!;
  switch (page) {
    case 'capture':
      return <CapturePage meta={meta} flow={flow} />;
    case 'display':
      return <DisplayPage meta={meta} />;
    case 'sound':
      return <SoundPage meta={meta} />;
    case 'lights':
      return <LightsPage meta={meta} />;
    case 'accents':
      return <AccentsPage meta={meta} />;
    case 'hotkeys':
      return <HotkeysPage meta={meta} />;
    case 'system':
      return <SystemPage meta={meta} goto={goto} />;
    case 'companion':
      return <CompanionPage meta={meta} />;
    case 'diagnostics':
      return <DiagnosticsPage meta={meta} />;
  }
}

// ---------- shared local pieces ----------
function PageHead({
  meta,
  sub,
  actions,
}: {
  meta: NavEntry;
  sub: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="ss__pagehead">
      <div className="ss__pageicon" style={{ background: meta.tint }}>
        <meta.icon size={26} />
      </div>
      <div>
        <h1 className="ss__pagetitle">{meta.label}</h1>
        <p className="ss__pagesub">{sub}</p>
      </div>
      {actions && <div className="ss__pagehead-actions">{actions}</div>}
    </header>
  );
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className="ss__switch"
      data-on={on}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    >
      <span className="ss__switchknob" />
    </button>
  );
}

function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  unit = '%',
  tint = 'var(--ss-accent)',
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  tint?: string;
  label?: string;
}) {
  return (
    <div className="ss__slider">
      {label && <span className="ss__sliderlabel">{label}</span>}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        style={{
          ['--tint' as string]: tint,
          ['--pct' as string]: `${((value - min) / (max - min)) * 100}%`,
        }}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className="ss__sliderval tnum">
        {value}
        {unit}
      </span>
    </div>
  );
}

// ---------- Capture ----------
function CapturePage({ meta, flow }: { meta: NavEntry; flow: ReturnType<typeof useCaptureFlow> }) {
  const { captures } = usePane();
  const actions = useActions();
  return (
    <>
      <PageHead
        meta={meta}
        sub="Grab the whole screen or drag to select a region. Copy, save, edit or enlarge."
        actions={
          <button className="ss__btn ss__btn--primary" onClick={() => flow.start()}>
            <Camera size={14} /> New capture
          </button>
        }
      />

      <div className="ss__captgrid">
        <button className="ss__captcard" onClick={() => flow.choose('fullscreen')}>
          <span className="ss__captcardicon">
            <Monitor size={20} />
          </span>
          <span className="ss__captname">Fullscreen</span>
          <span className="ss__captmeta">Capture every pixel · Ctrl ⇧ 3</span>
        </button>
        <button className="ss__captcard" onClick={() => flow.choose('area')}>
          <span className="ss__captcardicon">
            <MousePointerSquareDashed size={20} />
          </span>
          <span className="ss__captname">Select area</span>
          <span className="ss__captmeta">Drag a region · Ctrl ⇧ 4</span>
        </button>
      </div>

      <div className="ss__grouptitle">Recent captures</div>
      <div className="ss__card">
        {captures.length === 0 ? (
          <div className="ss__empty">
            No captures yet — press <kbd>Ctrl ⇧ 4</kbd> or use “New capture”.
          </div>
        ) : (
          captures.map((c) => (
            <div key={c.id} className="ss__row">
              <span
                className="ss__thumb"
                style={{
                  background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]}, ${c.gradient[2]})`,
                }}
              />
              <div className="ss__rowmain">
                <span className="ss__rowtitle">
                  {c.mode === 'area' ? 'Area capture' : 'Fullscreen capture'}
                </span>
                <span className="ss__rowsub">
                  {c.region ? `${c.region.w}×${c.region.h} px` : '3840×2160 px'} ·{' '}
                  {new Date(c.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {!c.savedPath && (
                <button className="ss__btn" onClick={() => actions.saveCapture(c.id)}>
                  Save
                </button>
              )}
              <span className="ss__tag" data-saved={Boolean(c.savedPath)}>
                {c.savedPath ? 'saved' : 'in memory'}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ---------- Display ----------
function DisplayPage({ meta }: { meta: NavEntry }) {
  const { monitors, displayPresets, activeDisplayPresetId } = usePane();
  const actions = useActions();
  return (
    <>
      <PageHead
        meta={meta}
        sub="Per-monitor DDC/CI brightness, contrast and RGB gain."
        actions={
          <button
            className="ss__btn"
            onClick={() => actions.saveDisplayPreset(`Preset ${displayPresets.length + 1}`)}
          >
            Save preset
          </button>
        }
      />

      <div className="ss__chips">
        {displayPresets.map((p) => (
          <button
            key={p.id}
            className="ss__chip"
            data-active={activeDisplayPresetId === p.id}
            onClick={() => actions.applyDisplayPreset(p.id)}
            title={p.description}
          >
            {p.name}
          </button>
        ))}
      </div>

      {monitors.map((m) => (
        <div key={m.id}>
          <div className="ss__grouptitle">
            {m.name}
            {m.primary && <span className="ss__badge">Primary</span>}
          </div>
          <div className="ss__card">
            <div className="ss__row">
              <div className="ss__rowmain">
                <span className="ss__rowtitle">{m.model}</span>
                <span className="ss__rowsub">
                  {m.resolution} · {m.refreshHz} Hz · {m.ddc ? 'DDC/CI' : 'No DDC'}
                </span>
              </div>
            </div>
            {m.ddc ? (
              <>
                <div className="ss__row ss__row--column">
                  <Slider
                    label="Brightness"
                    value={m.brightness}
                    onChange={(v) => actions.setMonitor(m.id, { brightness: v })}
                  />
                </div>
                <div className="ss__row ss__row--column">
                  <Slider
                    label="Contrast"
                    value={m.contrast}
                    onChange={(v) => actions.setMonitor(m.id, { contrast: v })}
                  />
                </div>
                <div className="ss__row ss__row--column">
                  <Slider
                    label="Red"
                    tint="#ff453a"
                    value={m.gain.r}
                    onChange={(v) => actions.setGain(m.id, 'r', v)}
                  />
                </div>
                <div className="ss__row ss__row--column">
                  <Slider
                    label="Green"
                    tint="#30d158"
                    value={m.gain.g}
                    onChange={(v) => actions.setGain(m.id, 'g', v)}
                  />
                </div>
                <div className="ss__row ss__row--column">
                  <Slider
                    label="Blue"
                    tint="#0a84ff"
                    value={m.gain.b}
                    onChange={(v) => actions.setGain(m.id, 'b', v)}
                  />
                </div>
              </>
            ) : (
              <div className="ss__warn">
                This display doesn’t expose DDC/CI — software brightness and gain control are
                unavailable. Use the monitor’s own buttons.
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

// ---------- Sound ----------
function SoundPage({ meta }: { meta: NavEntry }) {
  const { sound } = usePane();
  const actions = useActions();
  const outputs = sound.devices.filter((d) => d.kind === 'output');
  const inputs = sound.devices.filter((d) => d.kind === 'input');
  return (
    <>
      <PageHead meta={meta} sub="Default devices, levels and mute." />

      <div className="ss__grouptitle">Output</div>
      <div className="ss__card">
        <div className="ss__row">
          <span className="ss__rowtitle">Device</span>
          <select
            className="ss__select"
            value={sound.outputDeviceId}
            onChange={(e) => actions.setSound({ outputDeviceId: e.target.value })}
          >
            {outputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ss__row ss__row--column">
          <Slider
            label="Volume"
            value={sound.outputVolume}
            onChange={(v) => actions.setSound({ outputVolume: v, outputMuted: false })}
          />
        </div>
        <div className="ss__row">
          <div className="ss__rowmain">
            <span className="ss__rowtitle">Mute</span>
          </div>
          <Switch on={sound.outputMuted} onClick={() => actions.toggleMute('output')} />
        </div>
      </div>

      <div className="ss__grouptitle">Input</div>
      <div className="ss__card">
        <div className="ss__row">
          <span className="ss__rowtitle">Device</span>
          <select
            className="ss__select"
            value={sound.inputDeviceId}
            onChange={(e) => actions.setSound({ inputDeviceId: e.target.value })}
          >
            {inputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ss__row ss__row--column">
          <Slider
            label="Level"
            tint="#30d158"
            value={sound.inputVolume}
            onChange={(v) => actions.setSound({ inputVolume: v, inputMuted: false })}
          />
        </div>
        <div className="ss__row">
          <div className="ss__rowmain">
            <span className="ss__rowtitle">Mute</span>
          </div>
          <Switch on={sound.inputMuted} onClick={() => actions.toggleMute('input')} />
        </div>
      </div>
    </>
  );
}

// ---------- Lights ----------
function LightsPage({ meta }: { meta: NavEntry }) {
  const { lights, ambient, lightPresets, activeLightPresetId, monitors } = usePane();
  const actions = useActions();
  const source = monitors.find((m) => m.id === ambient.sourceMonitorId);
  return (
    <>
      <PageHead
        meta={meta}
        sub="ARGB sources, ambient screen-sync and presets."
        actions={
          <>
            <button className="ss__btn" onClick={() => actions.restoreLights()}>
              Restore
            </button>
            <button className="ss__btn" onClick={() => actions.allLightsOff()}>
              All off
            </button>
          </>
        }
      />

      <div className="ss__chips">
        {lightPresets.map((p) => (
          <button
            key={p.id}
            className="ss__chip"
            data-active={activeLightPresetId === p.id}
            onClick={() => actions.applyLightPreset(p.id)}
          >
            <span className="ss__chipdot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="ss__grouptitle">Ambient screen-sync</div>
      <div className="ss__card ss__card--accent">
        <div className="ss__row">
          <div className="ss__rowmain">
            <span className="ss__rowtitle">Screen-sync</span>
            <span className="ss__rowsub">Sampling {source?.name ?? 'primary display'}</span>
          </div>
          <Switch
            on={ambient.enabled}
            onClick={() => actions.setAmbient({ enabled: !ambient.enabled })}
          />
        </div>
        <div className="ss__row ss__row--column" data-dim={!ambient.enabled}>
          <Slider
            label="Brightness"
            value={ambient.brightness}
            onChange={(v) => actions.setAmbient({ brightness: v })}
          />
        </div>
        <div className="ss__row ss__row--column" data-dim={!ambient.enabled}>
          <Slider
            label="Saturation"
            tint="#ff375f"
            value={ambient.saturation}
            onChange={(v) => actions.setAmbient({ saturation: v })}
          />
        </div>
        <div className="ss__row ss__row--column" data-dim={!ambient.enabled}>
          <Slider
            label="Warmth"
            tint="#ff9f0a"
            value={ambient.warmth}
            onChange={(v) => actions.setAmbient({ warmth: v })}
          />
        </div>
        <div className="ss__row ss__row--column" data-dim={!ambient.enabled}>
          <Slider
            label="Zones"
            min={4}
            max={32}
            unit=""
            tint="#30d158"
            value={ambient.zones}
            onChange={(v) => actions.setAmbient({ zones: v })}
          />
        </div>
        <div className="ss__row ss__row--column" data-dim={!ambient.enabled}>
          <Slider
            label="Capture FPS"
            min={10}
            max={60}
            unit=" fps"
            tint="#64d2ff"
            value={ambient.fps}
            onChange={(v) => actions.setAmbient({ fps: v })}
          />
        </div>
      </div>

      <div className="ss__grouptitle">Sources</div>
      <div className="ss__card">
        {lights.map((l) => {
          const live = l.on && l.connected;
          return (
            <div key={l.id} className="ss__row" data-dim={!l.connected}>
              <span
                className="ss__lightdot"
                style={{
                  background: live ? l.color : '#48484a',
                  boxShadow: live ? `0 0 10px ${l.color}` : 'none',
                }}
              />
              <div className="ss__rowmain">
                <span className="ss__rowtitle">{l.name}</span>
                <span className="ss__rowsub">
                  {l.vendor} · {l.ledCount} LEDs · {l.effect}
                  {!l.connected && ' · disconnected'}
                </span>
              </div>
              <input
                type="color"
                className="ss__color"
                value={l.color}
                disabled={!l.connected}
                onChange={(e) => actions.setLight(l.id, { color: e.target.value })}
              />
              <div className="ss__rowslider">
                <Slider
                  tint={l.color}
                  value={l.brightness}
                  onChange={(v) => actions.setLight(l.id, { brightness: v })}
                />
              </div>
              <Switch on={l.on} onClick={() => actions.toggleLight(l.id)} />
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- Accents ----------
function AccentsPage({ meta }: { meta: NavEntry }) {
  const { accents } = usePane();
  const actions = useActions();
  return (
    <>
      <PageHead
        meta={meta}
        sub="Hold a key for diacritics — à â ä, è é ê, ñ, ç …"
        actions={<Switch on={accents.enabled} onClick={() => actions.toggleAccents()} />}
      />

      <div className="ss__grouptitle">Try it</div>
      <div className="ss__card">
        <div className="ss__playground">
          <AccentsPlayground accent={ACCENT} />
        </div>
      </div>
      <p className="ss__groupnote">
        Type a word, then press-and-hold a vowel. Pick a variant with the number keys.
      </p>

      <div className="ss__grouptitle">Behaviour</div>
      <div className="ss__card">
        <div className="ss__row">
          <div className="ss__rowmain">
            <span className="ss__rowtitle">Accents helper</span>
            <span className="ss__rowsub">Long-press to open the diacritic chooser</span>
          </div>
          <Switch on={accents.enabled} onClick={() => actions.toggleAccents()} />
        </div>
        <div className="ss__row ss__row--column">
          <Slider
            label="Long-press"
            min={120}
            max={600}
            unit=" ms"
            value={accents.holdMs}
            onChange={(v) => actions.setAccents({ holdMs: v })}
          />
        </div>
      </div>

      <div className="ss__grouptitle">Variant map</div>
      <div className="ss__card">
        <div className="ss__accentmap">
          {Object.entries(accents.map).map(([base, vs]) => (
            <div key={base} className="ss__accentkey">
              <span className="ss__accentbase">{base}</span>
              <span className="ss__accentvars">{vs.join(' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- Hotkeys ----------
function HotkeysPage({ meta }: { meta: NavEntry }) {
  const { hotkeys, remaps } = usePane();
  const actions = useActions();

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
      <PageHead meta={meta} sub="Global shortcuts and key remaps. Click a chord to rebind." />

      <div className="ss__grouptitle">Global shortcuts</div>
      <div className="ss__card">
        {hotkeys.map((h) => (
          <HotkeyRow
            key={h.id}
            h={h}
            conflict={h.enabled && conflicts.has(h.chord.join('+'))}
          />
        ))}
      </div>

      <div className="ss__grouptitle">Key remaps</div>
      <div className="ss__card">
        {remaps.length === 0 ? (
          <div className="ss__empty">No remaps. Add one below.</div>
        ) : (
          remaps.map((r) => (
            <div key={r.id} className="ss__row">
              <div className="ss__rowmain">
                <span className="ss__rowtitle">
                  <span className="ss__keys">{formatChord(r.from, ' + ')}</span>
                  <span className="ss__arrow">→</span>
                  <span className="ss__keys">{formatChord(r.to, ' + ')}</span>
                </span>
              </div>
              <Switch
                on={r.enabled}
                onClick={() => actions.updateRemap(r.id, { enabled: !r.enabled })}
              />
              <button className="ss__btn ss__btn--danger" onClick={() => actions.removeRemap(r.id)}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>
      <p className="ss__groupnote">
        <button
          className="ss__btn"
          onClick={() => actions.addRemap(['Alt', 'C'], ['Ctrl', 'C'])}
        >
          + Add remap (Alt+C → Ctrl+C)
        </button>
      </p>
    </>
  );
}

function HotkeyRow({ h, conflict }: { h: Hotkey; conflict: boolean }) {
  const actions = useActions();
  const { capturing, draft, start } = useChordCapture((chord) =>
    actions.setHotkeyChord(h.id, chord),
  );
  return (
    <div className="ss__row" data-dim={!h.enabled}>
      <div className="ss__rowmain">
        <span className="ss__rowtitle">{h.label}</span>
      </div>
      {conflict && <span className="ss__conflict">Conflict</span>}
      <button className="ss__chord" data-capturing={capturing} onClick={start}>
        {capturing
          ? draft.length
            ? formatChord(draft, ' ')
            : 'Press keys…'
          : formatChord(h.chord, ' ')}
      </button>
      <Switch on={h.enabled} onClick={() => actions.toggleHotkey(h.id)} />
    </div>
  );
}

// ---------- System ----------
function SystemPage({ meta, goto }: { meta: NavEntry; goto: (a: AreaKey) => void }) {
  const { system, diagnostics } = usePane();
  const actions = useActions();
  return (
    <>
      <PageHead meta={meta} sub="Startup, power and shortcuts." />

      <div className="ss__card">
        <div className="ss__row">
          <div className="ss__rowmain">
            <span className="ss__rowtitle">Run at startup</span>
            <span className="ss__rowsub">Launch Pane when you sign in</span>
          </div>
          <Switch on={system.runAtStartup} onClick={() => actions.toggleStartup()} />
        </div>
        <div className="ss__row">
          <div className="ss__rowmain">
            <span className="ss__rowtitle">Sleep now</span>
            <span className="ss__rowsub">Suspend the machine immediately</span>
          </div>
          <button className="ss__btn" onClick={() => actions.sleepNow()}>
            <Power size={14} /> Sleep
          </button>
        </div>
        <button className="ss__row ss__row--button" onClick={() => goto('hotkeys')}>
          <div className="ss__rowmain">
            <span className="ss__rowtitle">Hotkeys & remaps</span>
            <span className="ss__rowsub">Manage global shortcuts</span>
          </div>
          <span className="ss__chevron">›</span>
        </button>
      </div>

      <p className="ss__groupnote">Pane {diagnostics.version}</p>
    </>
  );
}

// ---------- Companion ----------
function CompanionPage({ meta }: { meta: NavEntry }) {
  const { companions } = usePane();
  const actions = useActions();
  return (
    <>
      <PageHead
        meta={meta}
        sub="Pair an iPhone to control Pane remotely."
        actions={
          <button className="ss__btn ss__btn--primary" onClick={() => actions.pairCompanion()}>
            Pair device
          </button>
        }
      />

      <div className="ss__grouptitle">Scan to pair</div>
      <div className="ss__card">
        <div className="ss__pair">
          <div className="ss__qr" aria-hidden>
            <QrMock />
          </div>
          <div className="ss__rowmain">
            <span className="ss__rowtitle">Open the Pane companion app</span>
            <span className="ss__rowsub">
              Scan this code to pair. Pairing is end-to-end encrypted; the code rotates every 60
              seconds.
            </span>
          </div>
        </div>
      </div>

      <div className="ss__grouptitle">Paired devices</div>
      <div className="ss__card">
        {companions.length === 0 ? (
          <div className="ss__empty">No paired devices.</div>
        ) : (
          companions.map((d) => (
            <div key={d.id} className="ss__row">
              <span className="ss__statusdot" data-on={d.online} />
              <div className="ss__rowmain">
                <span className="ss__rowtitle">{d.name}</span>
                <span className="ss__rowsub">
                  {d.model} · {d.online ? 'online' : `last seen ${d.lastSeen}`}
                </span>
              </div>
              <button
                className="ss__btn ss__btn--danger"
                onClick={() => actions.revokeCompanion(d.id)}
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function QrMock() {
  const cells = Array.from({ length: 144 }, (_, i) => (i * 37 + (i % 7) * 13) % 5 < 2);
  return (
    <div className="ss__qrgrid">
      {cells.map((on, i) => (
        <span key={i} data-on={on} />
      ))}
    </div>
  );
}

// ---------- Diagnostics ----------
function DiagnosticsPage({ meta }: { meta: NavEntry }) {
  const { diagnostics: d } = usePane();
  const stats = [
    { k: 'Working set', v: `${d.workingSetMB} MB` },
    { k: 'Peak working set', v: `${d.peakWorkingSetMB} MB` },
    { k: 'Startup time', v: `${d.startupMs} ms` },
    { k: 'Process ID', v: `${d.pid}` },
    {
      k: 'Uptime',
      v: `${Math.floor(d.uptimeSec / 3600)}h ${Math.floor((d.uptimeSec % 3600) / 60)}m`,
    },
    { k: 'CPU', v: `${d.cpuPercent}%` },
    { k: 'Version', v: d.version },
  ];
  return (
    <>
      <PageHead meta={meta} sub="Calm telemetry — nothing blinking for no reason." />
      <div className="ss__diaggrid">
        {stats.map((s) => (
          <div key={s.k} className="ss__diagcell">
            <span className="ss__diagk">{s.k}</span>
            <span className="ss__diagv tnum">{s.v}</span>
          </div>
        ))}
      </div>
    </>
  );
}
