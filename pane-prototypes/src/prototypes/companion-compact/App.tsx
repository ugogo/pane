import { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  BatteryFull,
  Camera,
  ChevronLeft,
  ChevronRight,
  Command,
  House,
  Keyboard,
  Lightbulb,
  Monitor,
  MoreHorizontal,
  Power,
  Search,
  Settings2,
  Signal,
  Smartphone,
  Type,
  Volume2,
  Wifi,
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

const ACCENT = '#ff9f0a';

// The five tabs. Each tab renders one or more feature areas; "more" drills
// into pushed sub-screens.
type Tab = 'home' | 'display' | 'lights' | 'sound' | 'more';
// Sub-screens reachable from the More tab (and via deep links from goto()).
type Sub = 'accents' | 'hotkeys' | 'system' | 'companion' | 'diagnostics';

const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'lights', label: 'Lights', icon: Lightbulb },
  { id: 'sound', label: 'Sound', icon: Volume2 },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

const TAB_TITLE: Record<Tab, string> = {
  home: 'Pane',
  display: 'Display',
  lights: 'Lights',
  sound: 'Sound',
  more: 'More',
};

const SUB_TITLE: Record<Sub, string> = {
  accents: 'Accents',
  hotkeys: 'Hotkeys',
  system: 'System',
  companion: 'Companion',
  diagnostics: 'Diagnostics',
};

export default function CompanionCompactApp() {
  const [tab, setTab] = usePersistentState<Tab>('companion:tab', 'home');
  // The navigation stack inside the More tab (empty = root list).
  const [stack, setStack] = usePersistentState<Sub[]>('companion:stack', []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const flow = useCaptureFlow();

  const sub = stack[stack.length - 1] ?? null;

  const push = useCallback((s: Sub) => setStack((st) => [...st, s]), [setStack]);
  const pop = useCallback(() => setStack((st) => st.slice(0, -1)), [setStack]);

  // Map the canonical area keys onto our tab + stack model.
  const goto = useCallback(
    (area: AreaKey) => {
      switch (area) {
        case 'capture':
        case 'companion' === area ? 'never' : area === 'capture' ? area : 'home':
          break;
      }
      if (area === 'display' || area === 'lights' || area === 'sound') {
        setStack([]);
        setTab(area);
      } else if (area === 'capture') {
        setStack([]);
        setTab('home');
      } else {
        // accents | hotkeys | system | companion | diagnostics
        setTab('more');
        setStack([area as Sub]);
      }
    },
    [setStack, setTab],
  );

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

  const title = sub ? SUB_TITLE[sub] : TAB_TITLE[tab];
  const showBack = tab === 'more' && stack.length > 0;

  return (
    <div className="cc">
      <div className="cc__backdrop" aria-hidden />

      <div className="cc__device">
        <div className="cc__notch" aria-hidden />
        {/* status bar */}
        <div className="cc__status">
          <span className="cc__time tnum">9:41</span>
          <span className="cc__statusicons">
            <Signal size={14} />
            <Wifi size={14} />
            <BatteryFull size={17} />
          </span>
        </div>

        {/* header (fixed) */}
        <header className="cc__header">
          {showBack ? (
            <button className="cc__back" onClick={pop} aria-label="Back">
              <ChevronLeft size={20} />
              <span>More</span>
            </button>
          ) : (
            <span className="cc__headerspacer" />
          )}
          <h1 className="cc__title" data-large={!showBack}>
            {title}
          </h1>
          {tab === 'home' && !sub ? (
            <button className="cc__searchbtn" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search size={18} />
            </button>
          ) : (
            <span className="cc__headerspacer" />
          )}
        </header>

        {/* scrolling content */}
        <main className="cc__scroll">
          <Screen
            tab={tab}
            sub={sub}
            flow={flow}
            push={push}
            openPalette={() => setPaletteOpen(true)}
          />
          <div className="cc__scrollpad" />
        </main>

        {/* bottom tab bar (fixed) */}
        <nav className="cc__tabbar">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                className="cc__tab"
                data-active={active}
                onClick={() => {
                  if (t.id === tab && t.id === 'more') setStack([]);
                  setTab(t.id);
                }}
              >
                <t.icon size={22} strokeWidth={active ? 2.4 : 2} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="cc__homebar" aria-hidden />
      </div>

      <div className="cc__caption">
        Pane Companion · iPhone vision <kbd className="cc__kbd">⌘K</kbd>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        goto={goto}
        startCapture={startCapture}
        accent={ACCENT}
        surfaceClass="cc__palette"
      />
      <CaptureOverlay flow={flow} accent={ACCENT} />
    </div>
  );
}

function Screen({
  tab,
  sub,
  flow,
  push,
  openPalette,
}: {
  tab: Tab;
  sub: Sub | null;
  flow: ReturnType<typeof useCaptureFlow>;
  push: (s: Sub) => void;
  openPalette: () => void;
}) {
  if (tab === 'more' && sub) {
    switch (sub) {
      case 'accents':
        return <AccentsScreen />;
      case 'hotkeys':
        return <HotkeysScreen />;
      case 'system':
        return <SystemScreen push={push} />;
      case 'companion':
        return <CompanionScreen />;
      case 'diagnostics':
        return <DiagnosticsScreen />;
    }
  }
  switch (tab) {
    case 'home':
      return <HomeScreen flow={flow} openPalette={openPalette} />;
    case 'display':
      return <DisplayScreen />;
    case 'lights':
      return <LightsScreen />;
    case 'sound':
      return <SoundScreen />;
    case 'more':
      return <MoreScreen push={push} />;
  }
}

/* ---------- shared compact controls ---------- */

function Card({
  children,
  title,
  footnote,
  pad = true,
}: {
  children: React.ReactNode;
  title?: string;
  footnote?: string;
  pad?: boolean;
}) {
  return (
    <section className="cc__group">
      {title && <h2 className="cc__grouptitle">{title}</h2>}
      <div className="cc__card" data-pad={pad}>
        {children}
      </div>
      {footnote && <p className="cc__footnote">{footnote}</p>}
    </section>
  );
}

function RowItem({
  icon,
  tint,
  label,
  detail,
  trailing,
  onClick,
  chevron,
}: {
  icon?: React.ReactNode;
  tint?: string;
  label: string;
  detail?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className="cc__row" onClick={onClick} data-tap={!!onClick}>
      {icon && (
        <span className="cc__rowicon" style={{ background: tint ?? '#8e8e93' }}>
          {icon}
        </span>
      )}
      <span className="cc__rowtext">
        <span className="cc__rowlabel">{label}</span>
        {detail && <span className="cc__rowdetail">{detail}</span>}
      </span>
      {trailing}
      {chevron && <ChevronRight size={18} className="cc__chev" />}
    </Tag>
  );
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className="cc__switch"
      data-on={on}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    >
      <span className="cc__switchknob" />
    </button>
  );
}

function BigSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  tint = ACCENT,
  label,
  unit = '%',
  icon,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  tint?: string;
  label?: string;
  unit?: string;
  icon?: React.ReactNode;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="cc__sliderfield">
      {label && (
        <div className="cc__sliderhead">
          <span className="cc__sliderlabel">{label}</span>
          <span className="cc__slidervalue tnum">
            {value}
            {unit}
          </span>
        </div>
      )}
      <div className="cc__slider">
        {icon && <span className="cc__slidericon">{icon}</span>}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          style={{ ['--tint' as string]: tint, ['--pct' as string]: `${pct}%` }}
          onChange={(e) => onChange(+e.target.value)}
        />
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="cc__segmented" style={{ ['--count' as string]: options.length, ['--idx' as string]: idx }}>
      <span className="cc__segthumb" />
      {options.map((o) => (
        <button
          key={o.value}
          className="cc__segbtn"
          data-active={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Home (capture + quick controls) ---------- */

function HomeScreen({
  flow,
  openPalette,
}: {
  flow: ReturnType<typeof useCaptureFlow>;
  openPalette: () => void;
}) {
  const { captures, sound, lights, ambient } = usePane();
  const actions = useActions();
  const litCount = lights.filter((l) => l.on && l.connected).length;

  return (
    <>
      <Card title="Capture" pad>
        <p className="cc__leadtext">Snap your desktop from your phone, then copy, save or edit.</p>
        <button className="cc__capturebtn" onClick={() => flow.start()}>
          <Camera size={26} />
          <span className="cc__capturebtntext">
            <span className="cc__capturebtntitle">New capture</span>
            <span className="cc__capturebtnsub">Fullscreen or select an area</span>
          </span>
        </button>
        <div className="cc__capturequick">
          <button className="cc__pill" onClick={() => flow.choose('fullscreen')}>
            <Monitor size={15} /> Fullscreen
          </button>
          <button className="cc__pill" onClick={() => flow.choose('area')}>
            <Camera size={15} /> Area
          </button>
          <button className="cc__pill" onClick={openPalette}>
            <Command size={15} /> Commands
          </button>
        </div>
      </Card>

      {captures.length > 0 && (
        <Card title="Recent" pad={false}>
          <div className="cc__captrail">
            {captures.slice(0, 6).map((c) => (
              <div key={c.id} className="cc__captchip">
                <span
                  className="cc__captthumb"
                  style={{
                    background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]}, ${c.gradient[2]})`,
                  }}
                />
                <span className="cc__captlabel">{c.savedPath ? 'saved' : c.mode}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Quick controls">
        <div className="cc__quickitem">
          <BigSlider
            label="Volume"
            value={sound.outputMuted ? 0 : sound.outputVolume}
            icon={<Volume2 size={16} />}
            onChange={(v) => actions.setSound({ outputVolume: v, outputMuted: false })}
          />
        </div>
        <div className="cc__rowdivider" />
        <RowItem
          icon={<Lightbulb size={16} />}
          tint="#ffd60a"
          label="Lights"
          detail={`${litCount} of ${lights.length} on · ambient ${ambient.enabled ? 'on' : 'off'}`}
          trailing={
            <div className="cc__inlinebtns">
              <button className="cc__minibtn" onClick={() => actions.restoreLights()}>
                Restore
              </button>
              <button className="cc__minibtn" onClick={() => actions.allLightsOff()}>
                All off
              </button>
            </div>
          }
        />
        <div className="cc__rowdivider" />
        <RowItem
          icon={<Power size={16} />}
          tint="#ff453a"
          label="Sleep desktop"
          detail="Suspend the paired machine"
          trailing={
            <button className="cc__minibtn cc__minibtn--danger" onClick={() => actions.sleepNow()}>
              Sleep
            </button>
          }
        />
      </Card>
    </>
  );
}

/* ---------- Display ---------- */

function DisplayScreen() {
  const { monitors, displayPresets, activeDisplayPresetId } = usePane();
  const actions = useActions();
  return (
    <>
      <Card title="Presets" pad={false}>
        <div className="cc__chiprow">
          {displayPresets.map((p) => (
            <button
              key={p.id}
              className="cc__chip"
              data-active={activeDisplayPresetId === p.id}
              onClick={() => actions.applyDisplayPreset(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      {monitors.map((m) => (
        <Card
          key={m.id}
          title={`${m.name}${m.primary ? '  ·  primary' : ''}`}
          footnote={`${m.model} · ${m.resolution} · ${m.refreshHz}Hz`}
        >
          {m.ddc ? (
            <>
              <BigSlider
                label="Brightness"
                value={m.brightness}
                onChange={(v) => actions.setMonitor(m.id, { brightness: v })}
              />
              <BigSlider
                label="Contrast"
                value={m.contrast}
                tint="#64d2ff"
                onChange={(v) => actions.setMonitor(m.id, { contrast: v })}
              />
              <div className="cc__rgbgrid">
                <BigSlider label="R" value={m.gain.r} tint="#ff453a" onChange={(v) => actions.setGain(m.id, 'r', v)} />
                <BigSlider label="G" value={m.gain.g} tint="#30d158" onChange={(v) => actions.setGain(m.id, 'g', v)} />
                <BigSlider label="B" value={m.gain.b} tint="#0a84ff" onChange={(v) => actions.setGain(m.id, 'b', v)} />
              </div>
            </>
          ) : (
            <div className="cc__notice">No DDC/CI — software brightness unavailable on this display.</div>
          )}
        </Card>
      ))}

      <button
        className="cc__widebtn"
        onClick={() => actions.saveDisplayPreset(`Preset ${displayPresets.length + 1}`)}
      >
        Save current as preset
      </button>
    </>
  );
}

/* ---------- Lights (richest) ---------- */

function LightsScreen() {
  const { lights, ambient, lightPresets, activeLightPresetId, monitors } = usePane();
  const actions = useActions();
  const source = monitors.find((m) => m.id === ambient.sourceMonitorId);

  return (
    <>
      <Card title="Scenes" pad={false}>
        <div className="cc__swatchrow">
          {lightPresets.map((p) => (
            <button
              key={p.id}
              className="cc__swatch"
              data-active={activeLightPresetId === p.id}
              onClick={() => actions.applyLightPreset(p.id)}
            >
              <span className="cc__swatchdot" style={{ background: p.color, boxShadow: `0 4px 14px ${p.color}88` }} />
              <span className="cc__swatchname">{p.name}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <RowItem
          icon={<Lightbulb size={16} />}
          tint="#ffd60a"
          label="Ambient screen-sync"
          detail={source ? `Sampling ${source.name}` : 'Sampling primary'}
          trailing={<Switch on={ambient.enabled} onClick={() => actions.setAmbient({ enabled: !ambient.enabled })} />}
        />
        <div className="cc__ambientbody" data-dim={!ambient.enabled}>
          <div className="cc__rowdivider" />
          <BigSlider label="Brightness" value={ambient.brightness} onChange={(v) => actions.setAmbient({ brightness: v })} />
          <BigSlider label="Saturation" value={ambient.saturation} tint="#ff6b9d" onChange={(v) => actions.setAmbient({ saturation: v })} />
          <BigSlider label="Warmth" value={ambient.warmth} tint="#ff9f0a" onChange={(v) => actions.setAmbient({ warmth: v })} />
          <div className="cc__rgbgrid cc__rgbgrid--two">
            <BigSlider label="Zones" value={ambient.zones} min={4} max={32} unit="" tint="#30d158" onChange={(v) => actions.setAmbient({ zones: v })} />
            <BigSlider label="Capture FPS" value={ambient.fps} min={10} max={60} unit="fps" tint="#64d2ff" onChange={(v) => actions.setAmbient({ fps: v })} />
          </div>
        </div>
      </Card>

      <Card title="Sources" pad={false}>
        {lights.map((l, i) => {
          const live = l.on && l.connected;
          return (
            <div key={l.id} className="cc__lightrow" data-off={!live}>
              {i > 0 && <div className="cc__rowdivider" />}
              <div className="cc__lightmain">
                <span
                  className="cc__lightdot"
                  style={{
                    background: live ? l.color : '#3a3a3c',
                    boxShadow: live ? `0 0 12px ${l.color}` : 'none',
                  }}
                />
                <span className="cc__rowtext">
                  <span className="cc__rowlabel">{l.name}</span>
                  <span className="cc__rowdetail">
                    {l.vendor} · {l.ledCount} LEDs · {l.effect}
                    {!l.connected && ' · disconnected'}
                  </span>
                </span>
                <label className="cc__colorwrap" data-disabled={!l.connected}>
                  <input
                    type="color"
                    className="cc__colorinput"
                    value={l.color}
                    disabled={!l.connected}
                    onChange={(e) => actions.setLight(l.id, { color: e.target.value })}
                  />
                </label>
                <Switch on={l.on} onClick={() => actions.toggleLight(l.id)} />
              </div>
              <BigSlider
                value={l.brightness}
                tint={l.connected ? l.color : '#8e8e93'}
                onChange={(v) => actions.setLight(l.id, { brightness: v })}
              />
            </div>
          );
        })}
      </Card>

      <div className="cc__btnpair">
        <button className="cc__widebtn" onClick={() => actions.restoreLights()}>
          Restore
        </button>
        <button className="cc__widebtn" onClick={() => actions.allLightsOff()}>
          All off
        </button>
      </div>
    </>
  );
}

/* ---------- Sound ---------- */

function SoundScreen() {
  const { sound } = usePane();
  const actions = useActions();
  const outputs = sound.devices.filter((d) => d.kind === 'output');
  const inputs = sound.devices.filter((d) => d.kind === 'input');

  return (
    <>
      <Card title="Output">
        <BigSlider
          label="Volume"
          value={sound.outputMuted ? 0 : sound.outputVolume}
          icon={<Volume2 size={16} />}
          onChange={(v) => actions.setSound({ outputVolume: v, outputMuted: false })}
        />
        <div className="cc__rowdivider" />
        <RowItem
          label="Mute output"
          trailing={<Switch on={sound.outputMuted} onClick={() => actions.toggleMute('output')} />}
        />
        <div className="cc__rowdivider" />
        <div className="cc__devicepicker">
          <span className="cc__devicelabel">Device</span>
          <Segmented
            options={outputs.map((d) => ({ value: d.id, label: d.name.split(' ')[0] }))}
            value={sound.outputDeviceId}
            onChange={(id) => actions.setSound({ outputDeviceId: id })}
          />
        </div>
      </Card>

      <Card title="Input">
        <BigSlider
          label="Gain"
          value={sound.inputMuted ? 0 : sound.inputVolume}
          tint="#30d158"
          onChange={(v) => actions.setSound({ inputVolume: v, inputMuted: false })}
        />
        <div className="cc__rowdivider" />
        <RowItem
          label="Mute input"
          trailing={<Switch on={sound.inputMuted} onClick={() => actions.toggleMute('input')} />}
        />
        <div className="cc__rowdivider" />
        <div className="cc__devicepicker">
          <span className="cc__devicelabel">Device</span>
          <Segmented
            options={inputs.map((d) => ({ value: d.id, label: d.name.split(' ')[0] }))}
            value={sound.inputDeviceId}
            onChange={(id) => actions.setSound({ inputDeviceId: id })}
          />
        </div>
      </Card>
    </>
  );
}

/* ---------- More (root list) ---------- */

function MoreScreen({ push }: { push: (s: Sub) => void }) {
  const { accents, hotkeys, companions, diagnostics } = usePane();
  const enabledHk = hotkeys.filter((h) => h.enabled).length;
  return (
    <>
      <Card pad={false}>
        <RowItem
          icon={<Type size={16} />}
          tint="#bf5af2"
          label="Accents"
          detail={accents.enabled ? 'On · long-press diacritics' : 'Off'}
          chevron
          onClick={() => push('accents')}
        />
        <div className="cc__rowdivider cc__rowdivider--inset" />
        <RowItem
          icon={<Keyboard size={16} />}
          tint="#5e5ce6"
          label="Hotkeys"
          detail={`${enabledHk} active shortcuts`}
          chevron
          onClick={() => push('hotkeys')}
        />
        <div className="cc__rowdivider cc__rowdivider--inset" />
        <RowItem
          icon={<Settings2 size={16} />}
          tint="#8e8e93"
          label="System"
          detail="Startup, power"
          chevron
          onClick={() => push('system')}
        />
      </Card>

      <Card pad={false}>
        <RowItem
          icon={<Smartphone size={16} />}
          tint="#ff9f0a"
          label="Companion"
          detail={`${companions.length} paired devices`}
          chevron
          onClick={() => push('companion')}
        />
        <div className="cc__rowdivider cc__rowdivider--inset" />
        <RowItem
          icon={<Activity size={16} />}
          tint="#30d158"
          label="Diagnostics"
          detail={`${diagnostics.workingSetMB} MB · v${diagnostics.version}`}
          chevron
          onClick={() => push('diagnostics')}
        />
      </Card>
    </>
  );
}

/* ---------- Accents ---------- */

function AccentsScreen() {
  const { accents } = usePane();
  const actions = useActions();
  return (
    <>
      <Card>
        <RowItem
          label="Accents helper"
          detail="Hold a vowel for à â ä, è é ê, ñ, ç…"
          trailing={<Switch on={accents.enabled} onClick={() => actions.toggleAccents()} />}
        />
      </Card>

      <Card title="Try it" footnote="Type a word, press-and-hold a vowel, then pick a variant with 1–6.">
        <AccentsPlayground accent={ACCENT} />
      </Card>

      <Card title="Long-press delay">
        <BigSlider
          label="Hold time"
          value={accents.holdMs}
          min={120}
          max={600}
          unit="ms"
          onChange={(v) => actions.setAccents({ holdMs: v })}
        />
      </Card>

      <Card title="Variant map" pad={false}>
        {Object.entries(accents.map).map(([base, vs], i) => (
          <div key={base}>
            {i > 0 && <div className="cc__rowdivider cc__rowdivider--inset" />}
            <div className="cc__accentrow">
              <span className="cc__accentbase">{base}</span>
              <span className="cc__accentvars">{vs.join('  ')}</span>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ---------- Hotkeys ---------- */

function HotkeysScreen() {
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
      <div className="cc__hint">
        On the desktop these are global. On a phone, tap a chord to preview a rebind.
      </div>

      <Card title="Shortcuts" pad={false}>
        {hotkeys.map((h, i) => (
          <div key={h.id}>
            {i > 0 && <div className="cc__rowdivider cc__rowdivider--inset" />}
            <HotkeyRow h={h} conflict={h.enabled && conflicts.has(h.chord.join('+'))} />
          </div>
        ))}
      </Card>

      <Card title="Key remaps" pad={false}>
        {remaps.map((r, i) => (
          <div key={r.id}>
            {i > 0 && <div className="cc__rowdivider cc__rowdivider--inset" />}
            <div className="cc__row">
              <span className="cc__rowtext">
                <span className="cc__remap">
                  <span className="cc__keycap">{formatChord(r.from, ' ')}</span>
                  <ChevronRight size={14} className="cc__chev" />
                  <span className="cc__keycap">{formatChord(r.to, ' ')}</span>
                </span>
              </span>
              <Switch on={r.enabled} onClick={() => actions.updateRemap(r.id, { enabled: !r.enabled })} />
              <button className="cc__iconx" onClick={() => actions.removeRemap(r.id)} aria-label="Remove">
                <X size={15} />
              </button>
            </div>
          </div>
        ))}
      </Card>

      <button className="cc__widebtn" onClick={() => actions.addRemap(['Alt', 'C'], ['Ctrl', 'C'])}>
        Add remap · Alt C → Ctrl C
      </button>
    </>
  );
}

function HotkeyRow({ h, conflict }: { h: Hotkey; conflict: boolean }) {
  const actions = useActions();
  const { capturing, draft, start } = useChordCapture((chord) => actions.setHotkeyChord(h.id, chord));
  return (
    <div className="cc__row" data-off={!h.enabled}>
      <span className="cc__rowtext">
        <span className="cc__rowlabel">
          {h.label}
          {conflict && <span className="cc__conflict">conflict</span>}
        </span>
      </span>
      <button className="cc__chordbtn" data-capturing={capturing} onClick={start}>
        {capturing ? (draft.length ? formatChord(draft, ' ') : 'Press…') : formatChord(h.chord, ' ')}
      </button>
      <Switch on={h.enabled} onClick={() => actions.toggleHotkey(h.id)} />
    </div>
  );
}

/* ---------- System ---------- */

function SystemScreen({ push }: { push: (s: Sub) => void }) {
  const { system, diagnostics } = usePane();
  const actions = useActions();
  return (
    <>
      <Card>
        <RowItem
          label="Run at startup"
          detail="Launch Pane when you sign in"
          trailing={<Switch on={system.runAtStartup} onClick={() => actions.toggleStartup()} />}
        />
        <div className="cc__rowdivider" />
        <RowItem
          label="Sleep now"
          detail="Suspend the machine immediately"
          trailing={
            <button className="cc__minibtn cc__minibtn--danger" onClick={() => actions.sleepNow()}>
              Sleep
            </button>
          }
        />
      </Card>

      <Card pad={false}>
        <RowItem
          icon={<Keyboard size={16} />}
          tint="#5e5ce6"
          label="Hotkeys & remaps"
          detail="Manage global shortcuts"
          chevron
          onClick={() => push('hotkeys')}
        />
      </Card>

      <p className="cc__centerfoot">Pane {diagnostics.version}</p>
    </>
  );
}

/* ---------- Companion (meta / fun) ---------- */

function CompanionScreen() {
  const { companions, diagnostics } = usePane();
  const actions = useActions();
  return (
    <>
      <Card title="This device" pad>
        <div className="cc__thisdevice">
          <div className="cc__thisicon">
            <Smartphone size={30} />
          </div>
          <div className="cc__rowtext">
            <span className="cc__rowlabel">iPhone 15 Pro</span>
            <span className="cc__rowdetail">
              <span className="cc__pairdot" /> Paired & online · controlling this Pane
            </span>
          </div>
        </div>
        <div className="cc__rowdivider" />
        <RowItem
          icon={<Monitor size={16} />}
          tint="#0a84ff"
          label="Studio Desktop"
          detail={`Pane ${diagnostics.version} · PID ${diagnostics.pid}`}
          trailing={<span className="cc__livetag">linked</span>}
        />
      </Card>

      <Card title="Other paired devices" pad={false}>
        {companions.map((d, i) => (
          <div key={d.id}>
            {i > 0 && <div className="cc__rowdivider cc__rowdivider--inset" />}
            <div className="cc__row">
              <span className="cc__statusdot" data-on={d.online} />
              <span className="cc__rowtext">
                <span className="cc__rowlabel">{d.name}</span>
                <span className="cc__rowdetail">
                  {d.model} · {d.online ? 'online' : `last seen ${d.lastSeen}`}
                </span>
              </span>
              <button className="cc__minibtn cc__minibtn--danger" onClick={() => actions.revokeCompanion(d.id)}>
                Revoke
              </button>
            </div>
          </div>
        ))}
      </Card>

      <button className="cc__widebtn cc__widebtn--accent" onClick={() => actions.pairCompanion()}>
        Pair a new device
      </button>
    </>
  );
}

/* ---------- Diagnostics ---------- */

function DiagnosticsScreen() {
  const { diagnostics: d } = usePane();
  const stats: { k: string; v: string }[] = [
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
      <div className="cc__statgrid">
        <div className="cc__statbig">
          <span className="cc__statbigval tnum">{d.workingSetMB}</span>
          <span className="cc__statbigunit">MB working set</span>
        </div>
        <div className="cc__statbig">
          <span className="cc__statbigval tnum">{d.cpuPercent}</span>
          <span className="cc__statbigunit">% CPU</span>
        </div>
      </div>
      <Card pad={false}>
        {stats.map((s, i) => (
          <div key={s.k}>
            {i > 0 && <div className="cc__rowdivider cc__rowdivider--inset" />}
            <div className="cc__statrow">
              <span className="cc__rowlabel">{s.k}</span>
              <span className="cc__statval tnum">{s.v}</span>
            </div>
          </div>
        ))}
      </Card>
      <p className="cc__centerfoot">Calm telemetry — nothing blinking for no reason.</p>
    </>
  );
}
