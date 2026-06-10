import { useCallback, useMemo, useState } from 'react';
import { Command } from 'lucide-react';
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

const ACCENT = '#27d3a2';

const NAV: { area: AreaKey; label: string; route: string }[] = [
  { area: 'capture', label: 'capture', route: 'capture' },
  { area: 'display', label: 'display', route: 'display' },
  { area: 'sound', label: 'sound', route: 'sound' },
  { area: 'lights', label: 'lights', route: 'lights' },
  { area: 'accents', label: 'accents', route: 'accents' },
  { area: 'hotkeys', label: 'hotkeys', route: 'hotkeys' },
  { area: 'system', label: 'system', route: 'system' },
  { area: 'companion', label: 'companion', route: 'companion' },
  { area: 'diagnostics', label: 'diagnostics', route: 'diagnostics' },
];

export default function TerminalCalmApp() {
  const [page, setPage] = usePersistentState<AreaKey>('terminal:page', 'capture');
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
    <div className="tc">
      <aside className="tc__rail">
        <div className="tc__brand">
          <span className="tc__brandmark">
            <Command size={13} strokeWidth={2.5} />
          </span>
          <span className="tc__brandname">pane</span>
          <span className="tc__brandtag">console</span>
        </div>

        <div className="tc__breadcrumb">
          <span className="tc__crumbroot">pane</span>
          <span className="tc__crumbsep">▸</span>
          <span className="tc__crumbleaf">{page}</span>
        </div>

        <nav className="tc__nav" aria-label="sections">
          {NAV.map((n) => (
            <button
              key={n.area}
              className="tc__navitem"
              data-active={page === n.area}
              onClick={() => setPage(n.area)}
            >
              <span className="tc__navmark">{page === n.area ? '▸' : ' '}</span>
              <span className="tc__navlabel">{n.label}</span>
            </button>
          ))}
        </nav>

        <button className="tc__prompt" onClick={() => setPaletteOpen(true)}>
          <span className="tc__promptcaret">❯</span>
          <span className="tc__prompttext">run a command</span>
          <kbd className="tc__kbd">⌘K</kbd>
        </button>
      </aside>

      <main className="tc__main">
        <Page page={page} flow={flow} goto={goto} />
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        goto={goto}
        startCapture={startCapture}
        accent={ACCENT}
        surfaceClass="cmdk__surface--mono"
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

// ---------- shared local primitives ----------

function Head({
  cmd,
  desc,
  action,
}: {
  cmd: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="tc__head">
      <div className="tc__headmain">
        <div className="tc__cmdline">
          <span className="tc__caret">❯</span>
          <span className="tc__cmd">pane {cmd}</span>
        </div>
        <p className="tc__desc">{desc}</p>
      </div>
      {action && <div className="tc__headaction">{action}</div>}
    </header>
  );
}

function Status({ ok = true, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <div className="tc__status" data-ok={ok}>
      <span className="tc__statusmark">{ok ? '✓' : '·'}</span>
      <span className="tc__statustext">{children}</span>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div className="tc__sectlabel">
      <span className="tc__sectbar">—</span> {label}
    </div>
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
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="tc__slider">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        style={{ ['--tint' as string]: tint, ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className="tc__sliderval tnum">
        {String(value).padStart(3, ' ')}
        {unit}
      </span>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className="tc__toggle"
      data-on={on}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    >
      {on ? '[ on ]' : '[off ]'}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tc__field">
      <span className="tc__fieldlabel">{label}</span>
      <div className="tc__fieldctrl">{children}</div>
    </div>
  );
}

// ---------- Capture ----------
function CapturePage({ flow }: { flow: ReturnType<typeof useCaptureFlow> }) {
  const { captures } = usePane();
  return (
    <>
      <Head
        cmd="capture"
        desc="Fullscreen or region — copy, save, edit, enlarge."
        action={
          <button className="tc__primary" onClick={() => flow.start()}>
            ❯ new capture
          </button>
        }
      />

      <div className="tc__capgrid">
        <button className="tc__capcard" onClick={() => flow.choose('fullscreen')}>
          <span className="tc__capname">fullscreen</span>
          <span className="tc__capmeta">Ctrl ⇧ 3</span>
          <span className="tc__capdesc">grab every connected display</span>
        </button>
        <button className="tc__capcard" onClick={() => flow.choose('area')}>
          <span className="tc__capname">select area</span>
          <span className="tc__capmeta">Ctrl ⇧ 4</span>
          <span className="tc__capdesc">drag a region, snap to edges</span>
        </button>
      </div>

      <Section label="recent captures" />
      {captures.length === 0 ? (
        <div className="tc__empty">
          <span className="tc__dim">$</span> no captures yet — press{' '}
          <kbd className="tc__kbd">Ctrl ⇧ 4</kbd> or run one above
        </div>
      ) : (
        <ul className="tc__loglist">
          {captures.map((c) => (
            <li key={c.id} className="tc__logrow">
              <span
                className="tc__thumb"
                style={{
                  background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]}, ${c.gradient[2]})`,
                }}
              />
              <span className="tc__logmain">
                <span className="tc__logtitle">
                  {c.mode === 'area' ? 'area' : 'fullscreen'}
                </span>
                <span className="tc__logmeta tnum">
                  {c.region ? `${c.region.w}×${c.region.h}` : '3840×2160'}px ·{' '}
                  {new Date(c.createdAt).toLocaleTimeString()}
                </span>
              </span>
              <span className="tc__logtag" data-saved={!!c.savedPath}>
                {c.savedPath ? 'saved' : 'in-memory'}
              </span>
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
      <Head
        cmd="display"
        desc="Per-monitor DDC/CI brightness, contrast and RGB gain."
        action={
          <button
            className="tc__ghost"
            onClick={() => actions.saveDisplayPreset(`Preset ${displayPresets.length + 1}`)}
          >
            + save preset
          </button>
        }
      />

      <Section label="presets" />
      <div className="tc__chips">
        {displayPresets.map((p) => (
          <button
            key={p.id}
            className="tc__chip"
            data-active={activeDisplayPresetId === p.id}
            onClick={() => actions.applyDisplayPreset(p.id)}
            title={p.description}
          >
            {activeDisplayPresetId === p.id ? '●' : '○'} {p.name}
          </button>
        ))}
      </div>

      <Section label="monitors" />
      <div className="tc__stack">
        {monitors.map((m) => (
          <div key={m.id} className="tc__block">
            <div className="tc__blockhead">
              <span className="tc__blocktitle">
                {m.name}
                {m.primary && <span className="tc__badge">primary</span>}
              </span>
              <span className="tc__blockmeta tnum">
                {m.model} · {m.resolution} · {m.refreshHz}Hz ·{' '}
                {m.ddc ? 'DDC/CI' : 'no-ddc'}
              </span>
            </div>
            {m.ddc ? (
              <div className="tc__fields">
                <Field label="brightness">
                  <Slider
                    value={m.brightness}
                    onChange={(v) => actions.setMonitor(m.id, { brightness: v })}
                  />
                </Field>
                <Field label="contrast">
                  <Slider
                    value={m.contrast}
                    onChange={(v) => actions.setMonitor(m.id, { contrast: v })}
                  />
                </Field>
                <Field label="gain.r">
                  <Slider value={m.gain.r} tint="#ff6b6b" onChange={(v) => actions.setGain(m.id, 'r', v)} />
                </Field>
                <Field label="gain.g">
                  <Slider value={m.gain.g} tint="#27d3a2" onChange={(v) => actions.setGain(m.id, 'g', v)} />
                </Field>
                <Field label="gain.b">
                  <Slider value={m.gain.b} tint="#5b9dff" onChange={(v) => actions.setGain(m.id, 'b', v)} />
                </Field>
              </div>
            ) : (
              <Status ok={false}>
                no DDC/CI channel — software control unavailable on this display
              </Status>
            )}
          </div>
        ))}
      </div>
    </>
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
      <Head cmd="sound" desc="Default devices, levels and mute." />

      <Section label="output" />
      <div className="tc__block">
        <Field label="device">
          <select
            className="tc__select"
            value={sound.outputDeviceId}
            onChange={(e) => actions.setSound({ outputDeviceId: e.target.value })}
          >
            {outputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="volume">
          <div className="tc__inlinerow">
            <Slider
              value={sound.outputVolume}
              onChange={(v) => actions.setSound({ outputVolume: v, outputMuted: false })}
            />
            <Toggle on={sound.outputMuted} onClick={() => actions.toggleMute('output')} />
          </div>
        </Field>
      </div>

      <Section label="input" />
      <div className="tc__block">
        <Field label="device">
          <select
            className="tc__select"
            value={sound.inputDeviceId}
            onChange={(e) => actions.setSound({ inputDeviceId: e.target.value })}
          >
            {inputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="volume">
          <div className="tc__inlinerow">
            <Slider
              value={sound.inputVolume}
              onChange={(v) => actions.setSound({ inputVolume: v, inputMuted: false })}
            />
            <Toggle on={sound.inputMuted} onClick={() => actions.toggleMute('input')} />
          </div>
        </Field>
      </div>
    </>
  );
}

// ---------- Lights ----------
function LightsPage() {
  const { lights, ambient, lightPresets, activeLightPresetId, monitors } = usePane();
  const actions = useActions();
  const onCount = lights.filter((l) => l.on && l.connected).length;
  return (
    <>
      <Head
        cmd="lights"
        desc="ARGB sources, ambient screen-sync and presets."
        action={
          <div className="tc__btnrow">
            <button className="tc__ghost" onClick={() => actions.restoreLights()}>
              restore
            </button>
            <button className="tc__ghost" onClick={() => actions.allLightsOff()}>
              all off
            </button>
          </div>
        }
      />

      <Status>
        {onCount} of {lights.length} sources lit ·{' '}
        {ambient.enabled ? 'ambient sync on' : 'ambient sync off'}
      </Status>

      <Section label="presets" />
      <div className="tc__chips">
        {lightPresets.map((p) => (
          <button
            key={p.id}
            className="tc__chip"
            data-active={activeLightPresetId === p.id}
            onClick={() => actions.applyLightPreset(p.id)}
          >
            <span className="tc__chipdot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      <Section label="ambient screen-sync" />
      <div className="tc__block tc__block--accent">
        <div className="tc__blockhead">
          <span className="tc__blocktitle">
            sampling {monitors.find((m) => m.id === ambient.sourceMonitorId)?.name}
          </span>
          <Toggle
            on={ambient.enabled}
            onClick={() => actions.setAmbient({ enabled: !ambient.enabled })}
          />
        </div>
        <div className="tc__fields" data-dim={!ambient.enabled}>
          <Field label="brightness">
            <Slider
              value={ambient.brightness}
              onChange={(v) => actions.setAmbient({ brightness: v })}
            />
          </Field>
          <Field label="saturation">
            <Slider
              value={ambient.saturation}
              tint="#ff6b9d"
              onChange={(v) => actions.setAmbient({ saturation: v })}
            />
          </Field>
          <Field label="warmth">
            <Slider
              value={ambient.warmth}
              tint="#ffb020"
              onChange={(v) => actions.setAmbient({ warmth: v })}
            />
          </Field>
          <Field label="zones">
            <Slider
              value={ambient.zones}
              min={4}
              max={32}
              unit=""
              tint="#27d3a2"
              onChange={(v) => actions.setAmbient({ zones: v })}
            />
          </Field>
          <Field label="capture.fps">
            <Slider
              value={ambient.fps}
              min={10}
              max={60}
              unit="fps"
              tint="#5b9dff"
              onChange={(v) => actions.setAmbient({ fps: v })}
            />
          </Field>
        </div>
      </div>

      <Section label="sources" />
      <ul className="tc__loglist">
        {lights.map((l) => {
          const lit = l.on && l.connected;
          return (
            <li key={l.id} className="tc__lightrow" data-off={!lit}>
              <span
                className="tc__lightdot"
                style={{
                  background: lit ? l.color : '#2a2e2c',
                  boxShadow: lit ? `0 0 10px ${l.color}` : 'none',
                }}
              />
              <span className="tc__logmain">
                <span className="tc__logtitle">{l.name}</span>
                <span className="tc__logmeta tnum">
                  {l.vendor} · {l.ledCount} LED · {l.effect}
                  {!l.connected && ' · offline'}
                </span>
              </span>
              <input
                type="color"
                className="tc__colorinput"
                value={l.color}
                disabled={!l.connected}
                onChange={(e) => actions.setLight(l.id, { color: e.target.value })}
              />
              <div className="tc__lightslider">
                <Slider
                  value={l.brightness}
                  tint={l.color}
                  onChange={(v) => actions.setLight(l.id, { brightness: v })}
                />
              </div>
              <Toggle on={l.on} onClick={() => actions.toggleLight(l.id)} />
            </li>
          );
        })}
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
      <Head
        cmd="accents"
        desc="Hold a key for diacritics — à â ä, è é ê, ñ, ç …"
        action={<Toggle on={accents.enabled} onClick={() => actions.toggleAccents()} />}
      />

      <Section label="try it" />
      <div className="tc__block">
        <p className="tc__desc">
          Type a word, then press-and-hold a vowel. Pick a variant with 1–6.
        </p>
        <AccentsPlayground accent={ACCENT} />
      </div>

      <Section label="long-press delay" />
      <div className="tc__block">
        <Field label="hold.ms">
          <Slider
            value={accents.holdMs}
            min={120}
            max={600}
            unit="ms"
            onChange={(v) => actions.setAccents({ holdMs: v })}
          />
        </Field>
        <div className="tc__accentmap">
          {Object.entries(accents.map).map(([base, vs]) => (
            <div key={base} className="tc__accentkey">
              <span className="tc__accentbase">{base}</span>
              <span className="tc__accentsep">→</span>
              <span className="tc__accentvars">{vs.join(' ')}</span>
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

  const conflicts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const h of hotkeys) {
      if (!h.enabled) continue;
      const k = h.chord.join('+');
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return new Set(
      [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k),
    );
  }, [hotkeys]);

  return (
    <>
      <Head cmd="hotkeys" desc="Global shortcuts and key remaps. Click a chord to rebind." />

      <Section label="global shortcuts" />
      <ul className="tc__keylist">
        {hotkeys.map((h) => (
          <HotkeyRow
            key={h.id}
            h={h}
            conflict={h.enabled && conflicts.has(h.chord.join('+'))}
          />
        ))}
      </ul>

      <Section label="key remaps" />
      <ul className="tc__keylist">
        {remaps.map((r) => (
          <li key={r.id} className="tc__keyrow">
            <span className="tc__remap">
              <span className="tc__chordstatic">{formatChord(r.from, ' ')}</span>
              <span className="tc__remaparrow">→</span>
              <span className="tc__chordstatic">{formatChord(r.to, ' ')}</span>
            </span>
            <span className="tc__keyspacer" />
            <Toggle
              on={r.enabled}
              onClick={() => actions.updateRemap(r.id, { enabled: !r.enabled })}
            />
            <button className="tc__rowx" onClick={() => actions.removeRemap(r.id)}>
              rm
            </button>
          </li>
        ))}
      </ul>
      <button
        className="tc__ghost"
        onClick={() => actions.addRemap(['Alt', 'C'], ['Ctrl', 'C'])}
      >
        + add remap (Alt C → Ctrl C)
      </button>
    </>
  );
}

function HotkeyRow({ h, conflict }: { h: Hotkey; conflict: boolean }) {
  const actions = useActions();
  const { capturing, draft, start } = useChordCapture((chord) =>
    actions.setHotkeyChord(h.id, chord),
  );
  return (
    <li className="tc__keyrow" data-off={!h.enabled}>
      <span className="tc__keylabel">{h.label}</span>
      {conflict && <span className="tc__conflict">conflict</span>}
      <span className="tc__keyspacer" />
      <button className="tc__chord" data-capturing={capturing} onClick={start}>
        {capturing
          ? draft.length
            ? formatChord(draft, ' ')
            : 'press keys…'
          : formatChord(h.chord, ' ')}
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
      <Head cmd="system" desc="Startup, power and shortcuts." />

      <ul className="tc__keylist">
        <li className="tc__keyrow">
          <span className="tc__logmain">
            <span className="tc__logtitle">run at startup</span>
            <span className="tc__logmeta">launch Pane when you sign in</span>
          </span>
          <span className="tc__keyspacer" />
          <Toggle on={system.runAtStartup} onClick={() => actions.toggleStartup()} />
        </li>
        <li className="tc__keyrow">
          <span className="tc__logmain">
            <span className="tc__logtitle">sleep now</span>
            <span className="tc__logmeta">suspend the machine immediately</span>
          </span>
          <span className="tc__keyspacer" />
          <button className="tc__ghost" onClick={() => actions.sleepNow()}>
            ⏻ sleep
          </button>
        </li>
        <li className="tc__keyrow tc__keyrow--link" onClick={() => goto('hotkeys')}>
          <span className="tc__logmain">
            <span className="tc__logtitle">hotkeys &amp; remaps</span>
            <span className="tc__logmeta">manage global shortcuts ▸</span>
          </span>
        </li>
      </ul>
      <div className="tc__versionline tnum">pane {diagnostics.version}</div>
    </>
  );
}

// ---------- Companion ----------
function CompanionPage() {
  const { companions } = usePane();
  const actions = useActions();
  return (
    <>
      <Head
        cmd="companion"
        desc="Pair an iPhone to control Pane remotely."
        action={
          <button className="tc__primary" onClick={() => actions.pairCompanion()}>
            ❯ pair device
          </button>
        }
      />

      <div className="tc__pairrow">
        <div className="tc__qr" aria-hidden>
          <QrMock />
        </div>
        <div className="tc__pairtext">
          <span className="tc__blocktitle">scan to pair</span>
          <p className="tc__desc">
            Open the Pane companion app and scan this code. Pairing is end-to-end
            encrypted; the code rotates every 60 seconds.
          </p>
          <Status>handshake ready · awaiting device</Status>
        </div>
      </div>

      <Section label="paired devices" />
      <ul className="tc__loglist">
        {companions.map((d) => (
          <li key={d.id} className="tc__logrow">
            <span className="tc__statusdot" data-on={d.online} />
            <span className="tc__logmain">
              <span className="tc__logtitle">{d.name}</span>
              <span className="tc__logmeta tnum">
                {d.model} · {d.online ? 'online' : `last seen ${d.lastSeen}`}
              </span>
            </span>
            <button className="tc__rowx" onClick={() => actions.revokeCompanion(d.id)}>
              revoke
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function QrMock() {
  const cells = Array.from({ length: 144 }, (_, i) => (i * 37 + (i % 7) * 13) % 5 < 2);
  return (
    <div className="tc__qrgrid">
      {cells.map((on, i) => (
        <span key={i} data-on={on} />
      ))}
    </div>
  );
}

// ---------- Diagnostics ----------
function DiagnosticsPage() {
  const { diagnostics: d } = usePane();
  const rows: { k: string; v: string }[] = [
    { k: 'working_set', v: `${d.workingSetMB} MB` },
    { k: 'peak_working_set', v: `${d.peakWorkingSetMB} MB` },
    { k: 'startup_time', v: `${d.startupMs} ms` },
    { k: 'pid', v: `${d.pid}` },
    {
      k: 'uptime',
      v: `${Math.floor(d.uptimeSec / 3600)}h ${Math.floor((d.uptimeSec % 3600) / 60)}m`,
    },
    { k: 'cpu', v: `${d.cpuPercent}%` },
    { k: 'version', v: d.version },
  ];
  return (
    <>
      <Head cmd="diagnostics" desc="Calm telemetry — nothing blinking for no reason." />

      <div className="tc__block">
        <dl className="tc__readout">
          {rows.map((r) => (
            <div key={r.k} className="tc__readrow">
              <dt className="tc__readk">{r.k}</dt>
              <dd className="tc__readdots" aria-hidden />
              <dd className="tc__readv tnum">{r.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Section label="working set · last 60s" />
      <div className="tc__block">
        <Sparkline />
        <Status>process healthy · gc nominal · no leaks detected</Status>
      </div>
    </>
  );
}

function Sparkline() {
  const pts = Array.from({ length: 48 }, (_, i) => 60 + Math.sin(i / 3) * 8 + (i % 5) * 2);
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const path = pts
    .map((p, i) => `${(i / (pts.length - 1)) * 100},${30 - ((p - min) / (max - min)) * 28}`)
    .join(' ');
  return (
    <svg className="tc__spark" viewBox="0 0 100 30" preserveAspectRatio="none">
      <polyline
        points={path}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
