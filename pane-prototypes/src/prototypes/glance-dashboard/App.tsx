import { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  Command,
  Keyboard,
  Lightbulb,
  Monitor as MonitorIcon,
  Moon,
  Power,
  Smartphone,
  Sparkles,
  Sun,
  Type,
  Volume2,
  VolumeX,
  X,
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

const ACCENT = '#ff6b9d';

// Areas that live as expandable drawers rather than wall tiles.
type DrawerKey = AreaKey | null;

export default function GlanceDashboardApp() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawer, setDrawer] = usePersistentState<DrawerKey>('gd:drawer', null);
  const flow = useCaptureFlow();

  const openDrawer = useCallback((a: AreaKey) => setDrawer(a), [setDrawer]);
  const goto = useCallback((area: AreaKey) => setDrawer(area), [setDrawer]);
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
    <div className="gd">
      <TopBar onPalette={() => setPaletteOpen(true)} />

      <main className="gd__wall">
        <BrightnessTile />
        <VolumeTile onExpand={() => openDrawer('sound')} />
        <LightsTile onExpand={() => openDrawer('lights')} />
        <CaptureTile flow={flow} />
        <QuickActionsTile />
        <AccentsTile onExpand={() => openDrawer('accents')} />
        <SmallTile
          icon={Keyboard}
          label="Hotkeys"
          hint="shortcuts & remaps"
          onClick={() => openDrawer('hotkeys')}
        />
        <SmallTile
          icon={Power}
          label="System"
          hint="startup & power"
          onClick={() => openDrawer('system')}
        />
        <SmallTile
          icon={Smartphone}
          label="Companion"
          hint="paired devices"
          onClick={() => openDrawer('companion')}
        />
        <SmallTile
          icon={Activity}
          label="Diagnostics"
          hint="live telemetry"
          onClick={() => openDrawer('diagnostics')}
        />
        <SmallTile
          icon={MonitorIcon}
          label="Displays"
          hint="per-monitor detail"
          onClick={() => openDrawer('display')}
        />
      </main>

      <Drawer area={drawer} onClose={() => setDrawer(null)} goto={goto} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        goto={goto}
        startCapture={startCapture}
        accent={ACCENT}
        surfaceClass="gd__cmdk"
      />
      <CaptureOverlay flow={flow} accent={ACCENT} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                            */
/* ------------------------------------------------------------------ */

function TopBar({ onPalette }: { onPalette: () => void }) {
  const { diagnostics } = usePane();
  const now = useMemo(
    () =>
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    [],
  );
  return (
    <header className="gd__top">
      <div className="gd__brand">
        <span className="gd__logo">
          <Command size={14} />
        </span>
        <span className="gd__brandname">Pane</span>
        <span className="gd__brandtag">Control Surface</span>
      </div>
      <div className="gd__topright">
        <span className="gd__clock tnum">{now}</span>
        <span className="gd__ver tnum">v{diagnostics.version}</span>
        <button className="gd__palettebtn" onClick={onPalette}>
          <Sparkles size={13} />
          <span>Commands</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable bits                                                      */
/* ------------------------------------------------------------------ */

function TileSlider({
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
    <div className="gd__slider">
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
      <span className="gd__slidernum tnum">
        {value}
        <em>{unit}</em>
      </span>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className="gd__toggle"
      data-on={on}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    >
      <span className="gd__toggleknob" />
    </button>
  );
}

function ExpandBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="gd__expand" onClick={onClick} aria-label="Expand">
      <span />
      <span />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Brightness tile (2x1) — master brightness over all DDC monitors    */
/* ------------------------------------------------------------------ */

function BrightnessTile() {
  const { monitors } = usePane();
  const actions = useActions();
  const ddc = monitors.filter((m) => m.ddc);
  const avg = ddc.length
    ? Math.round(ddc.reduce((a, m) => a + m.brightness, 0) / ddc.length)
    : 0;

  const setAll = (v: number) =>
    ddc.forEach((m) => actions.setMonitor(m.id, { brightness: v }));

  return (
    <section className="gd__tile gd__tile--2x1 gd__tile--bright">
      <div className="gd__tilehead">
        <span className="gd__tileicon">
          <Sun size={16} />
        </span>
        <span className="gd__tilelabel">Brightness</span>
        <span className="gd__tilesub">{ddc.length} displays</span>
      </div>
      <div className="gd__bigrow">
        <span className="gd__big tnum">
          {avg}
          <em>%</em>
        </span>
        <div className="gd__quickset">
          {[20, 50, 80, 100].map((v) => (
            <button key={v} className="gd__qbtn" onClick={() => setAll(v)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <TileSlider value={avg} onChange={setAll} tint="#ffd27a" />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Volume tile (1x1)                                                  */
/* ------------------------------------------------------------------ */

function VolumeTile({ onExpand }: { onExpand: () => void }) {
  const { sound } = usePane();
  const actions = useActions();
  const muted = sound.outputMuted;
  return (
    <section className="gd__tile gd__tile--1x1 gd__tile--vol">
      <div className="gd__tilehead">
        <span className="gd__tileicon">
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </span>
        <span className="gd__tilelabel">Volume</span>
        <ExpandBtn onClick={onExpand} />
      </div>
      <span className="gd__big tnum" data-dim={muted}>
        {muted ? '—' : sound.outputVolume}
        {!muted && <em>%</em>}
      </span>
      <TileSlider
        value={sound.outputVolume}
        tint="#7fd6ff"
        onChange={(v) =>
          actions.setSound({ outputVolume: v, outputMuted: false })
        }
      />
      <button
        className="gd__mutebtn"
        data-on={muted}
        onClick={() => actions.toggleMute('output')}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Lights tile (2x2) — ambient sync + presets + per-source            */
/* ------------------------------------------------------------------ */

function LightsTile({ onExpand }: { onExpand: () => void }) {
  const { lights, ambient, lightPresets, activeLightPresetId } = usePane();
  const actions = useActions();
  const glow =
    lightPresets.find((p) => p.id === activeLightPresetId)?.color ??
    lights.find((l) => l.on && l.connected)?.color ??
    ACCENT;

  return (
    <section
      className="gd__tile gd__tile--2x2 gd__tile--lights"
      style={{ ['--glow' as string]: glow }}
    >
      <div className="gd__tilehead">
        <span className="gd__tileicon">
          <Lightbulb size={16} />
        </span>
        <span className="gd__tilelabel">Lights</span>
        <ExpandBtn onClick={onExpand} />
      </div>

      <div className="gd__presets">
        {lightPresets.map((p) => (
          <button
            key={p.id}
            className="gd__swatch"
            data-active={activeLightPresetId === p.id}
            style={{ ['--c' as string]: p.color }}
            onClick={() => actions.applyLightPreset(p.id)}
            title={p.name}
          >
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      <div className="gd__ambient" data-on={ambient.enabled}>
        <div className="gd__ambientrow">
          <span className="gd__minilabel">Ambient screen-sync</span>
          <Toggle
            on={ambient.enabled}
            onClick={() => actions.setAmbient({ enabled: !ambient.enabled })}
          />
        </div>
        <MiniSlider
          label="Brightness"
          value={ambient.brightness}
          tint={glow}
          onChange={(v) => actions.setAmbient({ brightness: v })}
        />
        <MiniSlider
          label="Saturation"
          value={ambient.saturation}
          tint={glow}
          onChange={(v) => actions.setAmbient({ saturation: v })}
        />
      </div>

      <div className="gd__lightchips">
        {lights.map((l) => (
          <button
            key={l.id}
            className="gd__lightchip"
            data-off={!l.on || !l.connected}
            onClick={() => actions.toggleLight(l.id)}
            disabled={!l.connected}
            title={`${l.name}${!l.connected ? ' · disconnected' : ''}`}
          >
            <span
              className="gd__lightdot"
              style={{
                background: l.on && l.connected ? l.color : '#3a3a40',
                boxShadow:
                  l.on && l.connected ? `0 0 10px ${l.color}` : 'none',
              }}
            />
            <span className="gd__lightname">{l.name}</span>
          </button>
        ))}
      </div>

      <div className="gd__lightactions">
        <button className="gd__ghostmini" onClick={() => actions.restoreLights()}>
          Restore
        </button>
        <button className="gd__ghostmini" onClick={() => actions.allLightsOff()}>
          All off
        </button>
      </div>
    </section>
  );
}

function MiniSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  tint = ACCENT,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  tint?: string;
}) {
  return (
    <label className="gd__mini">
      <span className="gd__minilabel">{label}</span>
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
      <span className="gd__minival tnum">{value}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Capture tile (2x1)                                                 */
/* ------------------------------------------------------------------ */

function CaptureTile({ flow }: { flow: ReturnType<typeof useCaptureFlow> }) {
  const { captures } = usePane();
  const latest = captures[0];
  return (
    <section className="gd__tile gd__tile--2x1 gd__tile--capture">
      <div
        className="gd__capturethumb"
        style={
          latest
            ? {
                background: `linear-gradient(135deg, ${latest.gradient[0]}, ${latest.gradient[1]}, ${latest.gradient[2]})`,
              }
            : undefined
        }
      >
        {!latest && <Camera size={26} className="gd__captureempty" />}
        <span className="gd__capturebadge">
          {captures.length} shot{captures.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="gd__capturebody">
        <div className="gd__tilehead">
          <span className="gd__tileicon">
            <Camera size={16} />
          </span>
          <span className="gd__tilelabel">Latest capture</span>
        </div>
        <span className="gd__capturemeta tnum">
          {latest
            ? latest.region
              ? `${latest.region.w}×${latest.region.h}px`
              : '3840×2160px'
            : 'nothing captured yet'}
        </span>
        <div className="gd__capturebtns">
          <button className="gd__primarymini" onClick={() => flow.start()}>
            <Camera size={13} /> New capture
          </button>
          <button
            className="gd__ghostmini"
            onClick={() => flow.choose('area')}
          >
            Region
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Quick actions tile (1x1)                                           */
/* ------------------------------------------------------------------ */

function QuickActionsTile() {
  const { sound } = usePane();
  const actions = useActions();
  return (
    <section className="gd__tile gd__tile--1x1 gd__tile--quick">
      <div className="gd__tilehead">
        <span className="gd__tileicon">
          <Sparkles size={16} />
        </span>
        <span className="gd__tilelabel">Quick</span>
      </div>
      <div className="gd__quickgrid">
        <button className="gd__quickact" onClick={() => actions.allLightsOff()}>
          <Lightbulb size={16} />
          <span>Lights off</span>
        </button>
        <button className="gd__quickact" onClick={() => actions.restoreLights()}>
          <Sparkles size={16} />
          <span>Restore</span>
        </button>
        <button
          className="gd__quickact"
          onClick={() => actions.toggleMute('output')}
        >
          {sound.outputMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
          <span>{sound.outputMuted ? 'Unmute' : 'Mute'}</span>
        </button>
        <button className="gd__quickact" onClick={() => actions.sleepNow()}>
          <Moon size={16} />
          <span>Sleep</span>
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Accents tile (1x1)                                                 */
/* ------------------------------------------------------------------ */

function AccentsTile({ onExpand }: { onExpand: () => void }) {
  const { accents } = usePane();
  const actions = useActions();
  return (
    <section className="gd__tile gd__tile--1x1 gd__tile--accents">
      <div className="gd__tilehead">
        <span className="gd__tileicon">
          <Type size={16} />
        </span>
        <span className="gd__tilelabel">Accents</span>
        <ExpandBtn onClick={onExpand} />
      </div>
      <span className="gd__accentglyphs">à â ä é ê ñ ç</span>
      <span className="gd__tilesub">Hold a vowel for diacritics</span>
      <div className="gd__accentfoot">
        <span className="gd__minilabel">{accents.enabled ? 'Enabled' : 'Disabled'}</span>
        <Toggle on={accents.enabled} onClick={() => actions.toggleAccents()} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Small generic tile                                                 */
/* ------------------------------------------------------------------ */

function SmallTile({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button className="gd__tile gd__tile--1x1 gd__tile--nav" onClick={onClick}>
      <span className="gd__navicon">
        <Icon size={18} />
      </span>
      <span className="gd__navlabel">{label}</span>
      <span className="gd__tilesub">{hint}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Detail drawer                                                      */
/* ------------------------------------------------------------------ */

const DRAWER_TITLES: Record<string, { title: string; sub: string }> = {
  display: { title: 'Displays', sub: 'Per-monitor brightness, contrast & RGB gain' },
  sound: { title: 'Sound', sub: 'Devices, levels and mute' },
  lights: { title: 'Lights', sub: 'Ambient sync, sources and presets' },
  accents: { title: 'Accents', sub: 'Long-press diacritics' },
  hotkeys: { title: 'Hotkeys', sub: 'Global shortcuts & remaps' },
  system: { title: 'System', sub: 'Startup and power' },
  companion: { title: 'Companion', sub: 'Paired devices' },
  diagnostics: { title: 'Diagnostics', sub: 'Live telemetry' },
  capture: { title: 'Capture', sub: 'Recent captures' },
};

function Drawer({
  area,
  onClose,
  goto,
}: {
  area: DrawerKey;
  onClose: () => void;
  goto: (a: AreaKey) => void;
}) {
  if (!area) return null;
  const meta = DRAWER_TITLES[area];
  return (
    <div className="gd__scrim" onMouseDown={onClose}>
      <aside
        className="gd__drawer"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={meta?.title}
      >
        <header className="gd__drawerhead">
          <div>
            <h2 className="gd__drawertitle">{meta?.title}</h2>
            <p className="gd__drawersub">{meta?.sub}</p>
          </div>
          <button className="gd__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="gd__drawerbody">
          <DrawerContent area={area} goto={goto} />
        </div>
      </aside>
    </div>
  );
}

function DrawerContent({
  area,
  goto,
}: {
  area: AreaKey;
  goto: (a: AreaKey) => void;
}) {
  switch (area) {
    case 'display':
      return <DisplayDetail />;
    case 'sound':
      return <SoundDetail />;
    case 'lights':
      return <LightsDetail />;
    case 'accents':
      return <AccentsDetail />;
    case 'hotkeys':
      return <HotkeysDetail />;
    case 'system':
      return <SystemDetail goto={goto} />;
    case 'companion':
      return <CompanionDetail />;
    case 'diagnostics':
      return <DiagnosticsDetail />;
    case 'capture':
      return <CaptureDetail />;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="gd__field">
      <span className="gd__fieldlabel">{label}</span>
      {children}
    </div>
  );
}

/* ----- Display detail ----- */
function DisplayDetail() {
  const { monitors, displayPresets, activeDisplayPresetId } = usePane();
  const actions = useActions();
  return (
    <>
      <div className="gd__chiprow">
        {displayPresets.map((p) => (
          <button
            key={p.id}
            className="gd__chip"
            data-active={activeDisplayPresetId === p.id}
            onClick={() => actions.applyDisplayPreset(p.id)}
            title={p.description}
          >
            {p.name}
          </button>
        ))}
        <button
          className="gd__chip gd__chip--add"
          onClick={() =>
            actions.saveDisplayPreset(`Preset ${displayPresets.length + 1}`)
          }
        >
          + Save current
        </button>
      </div>
      {monitors.map((m) => (
        <div key={m.id} className="gd__card">
          <div className="gd__cardhead">
            <span className="gd__cardtitle">
              {m.name}
              {m.primary && <span className="gd__badge">primary</span>}
            </span>
            <span className="gd__cardmeta">
              {m.model} · {m.resolution} · {m.refreshHz}Hz
            </span>
          </div>
          {m.ddc ? (
            <div className="gd__fields">
              <Field label="Brightness">
                <TileSlider
                  value={m.brightness}
                  tint="#ffd27a"
                  onChange={(v) => actions.setMonitor(m.id, { brightness: v })}
                />
              </Field>
              <Field label="Contrast">
                <TileSlider
                  value={m.contrast}
                  onChange={(v) => actions.setMonitor(m.id, { contrast: v })}
                />
              </Field>
              <Field label="Red gain">
                <TileSlider
                  value={m.gain.r}
                  tint="#ff5f57"
                  onChange={(v) => actions.setGain(m.id, 'r', v)}
                />
              </Field>
              <Field label="Green gain">
                <TileSlider
                  value={m.gain.g}
                  tint="#28c840"
                  onChange={(v) => actions.setGain(m.id, 'g', v)}
                />
              </Field>
              <Field label="Blue gain">
                <TileSlider
                  value={m.gain.b}
                  tint="#4cc9ff"
                  onChange={(v) => actions.setGain(m.id, 'b', v)}
                />
              </Field>
            </div>
          ) : (
            <div className="gd__warn">
              No DDC/CI — software control unavailable.
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/* ----- Sound detail ----- */
function SoundDetail() {
  const { sound } = usePane();
  const actions = useActions();
  const outputs = sound.devices.filter((d) => d.kind === 'output');
  const inputs = sound.devices.filter((d) => d.kind === 'input');
  return (
    <>
      <div className="gd__card">
        <span className="gd__cardtitle">Output</span>
        <select
          className="gd__select"
          value={sound.outputDeviceId}
          onChange={(e) => actions.setSound({ outputDeviceId: e.target.value })}
        >
          {outputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Field label="Level">
          <TileSlider
            value={sound.outputVolume}
            tint="#7fd6ff"
            onChange={(v) =>
              actions.setSound({ outputVolume: v, outputMuted: false })
            }
          />
        </Field>
        <button
          className="gd__mutebtn"
          data-on={sound.outputMuted}
          onClick={() => actions.toggleMute('output')}
        >
          {sound.outputMuted ? 'Unmute output' : 'Mute output'}
        </button>
      </div>
      <div className="gd__card">
        <span className="gd__cardtitle">Input</span>
        <select
          className="gd__select"
          value={sound.inputDeviceId}
          onChange={(e) => actions.setSound({ inputDeviceId: e.target.value })}
        >
          {inputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Field label="Level">
          <TileSlider
            value={sound.inputVolume}
            tint="#27d3a2"
            onChange={(v) =>
              actions.setSound({ inputVolume: v, inputMuted: false })
            }
          />
        </Field>
        <button
          className="gd__mutebtn"
          data-on={sound.inputMuted}
          onClick={() => actions.toggleMute('input')}
        >
          {sound.inputMuted ? 'Unmute input' : 'Mute input'}
        </button>
      </div>
    </>
  );
}

/* ----- Lights detail ----- */
function LightsDetail() {
  const { lights, ambient, monitors } = usePane();
  const actions = useActions();
  return (
    <>
      <div className="gd__card">
        <div className="gd__cardhead">
          <span className="gd__cardtitle">Ambient screen-sync</span>
          <Toggle
            on={ambient.enabled}
            onClick={() => actions.setAmbient({ enabled: !ambient.enabled })}
          />
        </div>
        <span className="gd__cardmeta">
          Sampling{' '}
          {monitors.find((m) => m.id === ambient.sourceMonitorId)?.name}
        </span>
        <div className="gd__fields" data-dim={!ambient.enabled}>
          <Field label="Brightness">
            <TileSlider
              value={ambient.brightness}
              onChange={(v) => actions.setAmbient({ brightness: v })}
            />
          </Field>
          <Field label="Saturation">
            <TileSlider
              value={ambient.saturation}
              tint="#ff6b9d"
              onChange={(v) => actions.setAmbient({ saturation: v })}
            />
          </Field>
          <Field label="Warmth">
            <TileSlider
              value={ambient.warmth}
              tint="#ffb020"
              onChange={(v) => actions.setAmbient({ warmth: v })}
            />
          </Field>
          <Field label="Zones">
            <TileSlider
              value={ambient.zones}
              min={4}
              max={32}
              unit=""
              tint="#27d3a2"
              onChange={(v) => actions.setAmbient({ zones: v })}
            />
          </Field>
          <Field label="Capture FPS">
            <TileSlider
              value={ambient.fps}
              min={10}
              max={60}
              unit="fps"
              tint="#4cc9ff"
              onChange={(v) => actions.setAmbient({ fps: v })}
            />
          </Field>
        </div>
      </div>

      <span className="gd__sectionlabel">Sources</span>
      {lights.map((l) => (
        <div key={l.id} className="gd__card gd__card--row" data-off={!l.on || !l.connected}>
          <div className="gd__cardhead">
            <span className="gd__cardtitle">
              <span
                className="gd__lightdot"
                style={{
                  background: l.on && l.connected ? l.color : '#3a3a40',
                  boxShadow:
                    l.on && l.connected ? `0 0 10px ${l.color}` : 'none',
                }}
              />
              {l.name}
            </span>
            <Toggle on={l.on} onClick={() => actions.toggleLight(l.id)} />
          </div>
          <span className="gd__cardmeta">
            {l.vendor} · {l.ledCount} LEDs · {l.effect}
            {!l.connected && ' · disconnected'}
          </span>
          <div className="gd__lightcontrols">
            <input
              type="color"
              className="gd__colorinput"
              value={l.color}
              disabled={!l.connected}
              onChange={(e) => actions.setLight(l.id, { color: e.target.value })}
            />
            <TileSlider
              value={l.brightness}
              tint={l.color}
              onChange={(v) => actions.setLight(l.id, { brightness: v })}
            />
          </div>
        </div>
      ))}
    </>
  );
}

/* ----- Accents detail ----- */
function AccentsDetail() {
  const { accents } = usePane();
  const actions = useActions();
  return (
    <>
      <div className="gd__card">
        <div className="gd__cardhead">
          <span className="gd__cardtitle">Accents helper</span>
          <Toggle on={accents.enabled} onClick={() => actions.toggleAccents()} />
        </div>
        <span className="gd__cardmeta">
          Type a word, then press-and-hold a vowel. Pick a variant with 1–6.
        </span>
        <AccentsPlayground accent={ACCENT} />
      </div>
      <div className="gd__card">
        <div className="gd__cardhead">
          <span className="gd__cardtitle">Long-press delay</span>
          <span className="gd__cardmeta tnum">{accents.holdMs}ms</span>
        </div>
        <TileSlider
          value={accents.holdMs}
          min={120}
          max={600}
          unit="ms"
          onChange={(v) => actions.setAccents({ holdMs: v })}
        />
        <div className="gd__accentmap">
          {Object.entries(accents.map).map(([base, vs]) => (
            <div key={base} className="gd__accentkey">
              <span className="gd__accentbase">{base}</span>
              <span className="gd__accentvars">{vs.join(' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ----- Hotkeys detail ----- */
function HotkeysDetail() {
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
      <span className="gd__sectionlabel">Global shortcuts</span>
      {hotkeys.map((h) => (
        <HotkeyRow
          key={h.id}
          h={h}
          conflict={h.enabled && conflicts.has(h.chord.join('+'))}
        />
      ))}

      <span className="gd__sectionlabel">Key remaps</span>
      {remaps.map((r) => (
        <div key={r.id} className="gd__card gd__card--row">
          <span className="gd__cardtitle">
            <span className="gd__keys">{formatChord(r.from, ' + ')}</span>
            <span className="gd__arrow">→</span>
            <span className="gd__keys">{formatChord(r.to, ' + ')}</span>
          </span>
          <div className="gd__rowctl">
            <Toggle
              on={r.enabled}
              onClick={() => actions.updateRemap(r.id, { enabled: !r.enabled })}
            />
            <button className="gd__rowx" onClick={() => actions.removeRemap(r.id)}>
              remove
            </button>
          </div>
        </div>
      ))}
      <button
        className="gd__ghostmini"
        onClick={() => actions.addRemap(['Alt', 'C'], ['Ctrl', 'C'])}
      >
        + Add remap (Alt+C → Ctrl+C)
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
    <div className="gd__card gd__card--row" data-off={!h.enabled}>
      <span className="gd__cardtitle">
        {h.label}
        {conflict && <span className="gd__conflict">conflict</span>}
      </span>
      <div className="gd__rowctl">
        <button className="gd__chord" data-capturing={capturing} onClick={start}>
          {capturing
            ? draft.length
              ? formatChord(draft, ' ')
              : 'Press keys…'
            : formatChord(h.chord, ' ')}
        </button>
        <Toggle on={h.enabled} onClick={() => actions.toggleHotkey(h.id)} />
      </div>
    </div>
  );
}

/* ----- System detail ----- */
function SystemDetail({ goto }: { goto: (a: AreaKey) => void }) {
  const { system, diagnostics } = usePane();
  const actions = useActions();
  return (
    <>
      <div className="gd__card gd__card--row">
        <span className="gd__cardtitle">Run at startup</span>
        <Toggle on={system.runAtStartup} onClick={() => actions.toggleStartup()} />
      </div>
      <div className="gd__card gd__card--row">
        <div>
          <span className="gd__cardtitle">Sleep now</span>
          <span className="gd__cardmeta">Suspend the machine immediately</span>
        </div>
        <button className="gd__ghostmini" onClick={() => actions.sleepNow()}>
          <Power size={13} /> Sleep
        </button>
      </div>
      <button className="gd__card gd__card--link" onClick={() => goto('hotkeys')}>
        <span className="gd__cardtitle">Hotkeys & remaps</span>
        <span className="gd__cardmeta">Manage global shortcuts →</span>
      </button>
      <span className="gd__sectionlabel">Pane {diagnostics.version}</span>
    </>
  );
}

/* ----- Companion detail ----- */
function CompanionDetail() {
  const { companions } = usePane();
  const actions = useActions();
  return (
    <>
      <div className="gd__card gd__pair">
        <div className="gd__qr" aria-hidden>
          <QrMock />
        </div>
        <div>
          <span className="gd__cardtitle">Scan to pair</span>
          <p className="gd__cardmeta" style={{ maxWidth: '30ch' }}>
            Open the Pane companion app and scan this code. Pairing is
            end-to-end encrypted; the code rotates every 60 seconds.
          </p>
          <button
            className="gd__primarymini"
            onClick={() => actions.pairCompanion()}
          >
            Pair device
          </button>
        </div>
      </div>
      <span className="gd__sectionlabel">Paired devices</span>
      {companions.map((d) => (
        <div key={d.id} className="gd__card gd__card--row">
          <div className="gd__cardtitle">
            <span className="gd__statusdot" data-on={d.online} />
            {d.name}
            <span className="gd__cardmeta">
              {d.model} · {d.online ? 'online' : `last seen ${d.lastSeen}`}
            </span>
          </div>
          <button className="gd__rowx" onClick={() => actions.revokeCompanion(d.id)}>
            revoke
          </button>
        </div>
      ))}
    </>
  );
}

function QrMock() {
  const cells = Array.from(
    { length: 144 },
    (_, i) => (i * 37 + (i % 7) * 13) % 5 < 2,
  );
  return (
    <div className="gd__qrgrid">
      {cells.map((on, i) => (
        <span key={i} data-on={on} />
      ))}
    </div>
  );
}

/* ----- Diagnostics detail ----- */
function DiagnosticsDetail() {
  const { diagnostics: d } = usePane();
  const stats = [
    { k: 'Working set', v: `${d.workingSetMB} MB` },
    { k: 'Peak', v: `${d.peakWorkingSetMB} MB` },
    { k: 'Startup', v: `${d.startupMs} ms` },
    { k: 'PID', v: `${d.pid}` },
    {
      k: 'Uptime',
      v: `${Math.floor(d.uptimeSec / 3600)}h ${Math.floor(
        (d.uptimeSec % 3600) / 60,
      )}m`,
    },
    { k: 'CPU', v: `${d.cpuPercent}%` },
  ];
  return (
    <>
      <div className="gd__statgrid">
        {stats.map((s) => (
          <div key={s.k} className="gd__statcell">
            <span className="gd__statk">{s.k}</span>
            <span className="gd__statv tnum">{s.v}</span>
          </div>
        ))}
      </div>
      <div className="gd__card">
        <span className="gd__cardtitle">Working set (last 60s)</span>
        <Sparkline />
      </div>
    </>
  );
}

function Sparkline() {
  const pts = Array.from(
    { length: 40 },
    (_, i) => 60 + Math.sin(i / 3) * 8 + (i % 5) * 2,
  );
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const d = pts
    .map(
      (p, i) =>
        `${(i / (pts.length - 1)) * 100},${30 - ((p - min) / (max - min)) * 28}`,
    )
    .join(' ');
  return (
    <svg className="gd__spark" viewBox="0 0 100 30" preserveAspectRatio="none">
      <polyline
        points={d}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ----- Capture detail ----- */
function CaptureDetail() {
  const { captures } = usePane();
  return (
    <>
      {captures.length === 0 ? (
        <div className="gd__warn">No captures yet.</div>
      ) : (
        captures.map((c) => (
          <div key={c.id} className="gd__card gd__card--row">
            <span
              className="gd__capturethumbsm"
              style={{
                background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]}, ${c.gradient[2]})`,
              }}
            />
            <div className="gd__cardtitle">
              {c.mode === 'area' ? 'Area capture' : 'Fullscreen capture'}
              <span className="gd__cardmeta tnum">
                {c.region ? `${c.region.w}×${c.region.h}px` : '3840×2160px'} ·{' '}
                {new Date(c.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <span className="gd__tag">{c.savedPath ? 'saved' : 'in memory'}</span>
          </div>
        ))
      )}
    </>
  );
}
