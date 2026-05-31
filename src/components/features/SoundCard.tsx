import { useEffect, useReducer, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  Button,
  Slider,
  Body1,
  Caption1,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  Speaker2Regular,
  SpeakerMuteRegular,
  MicRegular,
  MicOffRegular,
  StarRegular,
  StarFilled,
} from '@fluentui/react-icons';
import { FeatureCard } from '../FeatureCard';
import type { ProbeStatus } from '../../lib/status';
import {
  listOutputDevices,
  listInputDevices,
  setDefaultOutputDevice,
  setDefaultInputDevice,
  getOutputVolume,
  getInputVolume,
  setOutputVolume,
  setInputVolume,
  setOutputMute,
  setInputMute,
  type AudioDevice,
  type VolumeInfo,
} from '../../lib/commands';

// Avoid flooding the endpoint with a write on every pixel of slider drag.
const WRITE_DEBOUNCE_MS = 100;

type Kind = 'output' | 'input';

interface VolumeChange {
  kind: Kind;
  volume: number;
  muted: boolean;
}

const setVolumeFor: Record<Kind, (v: number) => Promise<void>> = {
  output: setOutputVolume,
  input: setInputVolume,
};
const setMuteFor: Record<Kind, (m: boolean) => Promise<void>> = {
  output: setOutputMute,
  input: setInputMute,
};
const setDefaultFor: Record<Kind, (id: string) => Promise<void>> = {
  output: setDefaultOutputDevice,
  input: setDefaultInputDevice,
};

function vpct(volume: number) {
  return Math.round(volume * 100);
}

// A missing default endpoint (e.g. no input device) shouldn't sink the whole
// load, so a failed read just yields null.
function readVolume(
  read: () => Promise<VolumeInfo>,
): Promise<VolumeInfo | null> {
  return read().catch(() => null);
}

function favKey(kind: Kind) {
  return `pane.audio.favorites.${kind}`;
}

function readFavorites(kind: Kind): Set<string> {
  try {
    const raw = localStorage.getItem(favKey(kind));
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

// Favorites float to the top; everything else stays alphabetical.
function orderDevices(
  devices: AudioDevice[],
  favs: Set<string>,
): AudioDevice[] {
  return devices.toSorted((a, b) => {
    const fa = favs.has(a.id) ? 0 : 1;
    const fb = favs.has(b.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });
}

interface State {
  devices: Record<Kind, AudioDevice[]>;
  volumes: Record<Kind, VolumeInfo | null>;
  status: ProbeStatus;
  message: string;
  busy: boolean;
}

type Action =
  | { type: 'beginLoad' }
  | {
      type: 'loaded';
      devices: Record<Kind, AudioDevice[]>;
      volumes: Record<Kind, VolumeInfo | null>;
      status: ProbeStatus;
      message: string;
    }
  | { type: 'loadFailed'; message: string }
  | { type: 'setVolume'; kind: Kind; info: VolumeInfo }
  | { type: 'externalVolume'; kind: Kind; info: VolumeInfo }
  | { type: 'notify'; status: ProbeStatus; message: string };

const initialState: State = {
  devices: { output: [], input: [] },
  volumes: { output: null, input: null },
  status: 'idle',
  message: '',
  // Starts true because we enumerate devices on mount.
  busy: true,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'beginLoad':
      return { ...state, busy: true, status: 'idle' };
    case 'loaded':
      return {
        ...state,
        devices: action.devices,
        volumes: action.volumes,
        status: action.status,
        message: action.message,
        busy: false,
      };
    case 'loadFailed':
      return { ...state, status: 'fail', message: action.message, busy: false };
    case 'setVolume':
      return {
        ...state,
        volumes: { ...state.volumes, [action.kind]: action.info },
      };
    case 'externalVolume': {
      // Skip no-op echoes so we don't clobber an in-progress drag.
      const prev = state.volumes[action.kind];
      if (
        prev &&
        vpct(prev.volume) === vpct(action.info.volume) &&
        prev.muted === action.info.muted
      ) {
        return state;
      }
      return {
        ...state,
        volumes: { ...state.volumes, [action.kind]: action.info },
      };
    }
    case 'notify':
      return { ...state, status: action.status, message: action.message };
  }
}

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  message: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '12px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '160px',
    overflowY: 'auto',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingLeft: '8px',
    paddingRight: '8px',
    paddingTop: '6px',
    paddingBottom: '6px',
  },
  itemDefault: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  deviceBtn: {
    display: 'flex',
    flexGrow: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'transparent',
    ...shorthands.borderStyle('none'),
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    textAlign: 'left',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  },
  dot: {
    width: '6px',
    height: '6px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: 'transparent',
  },
  dotOn: { backgroundColor: tokens.colorBrandBackground },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground2,
  },
  nameDefault: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  volRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  slider: { flexGrow: 1 },
  volPct: {
    minWidth: '44px',
    textAlign: 'right',
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
});

type Styles = ReturnType<typeof useStyles>;

export function SoundCard() {
  const styles = useStyles();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { devices, volumes, status, message, busy } = state;
  const [favorites, setFavorites] = useState<Record<Kind, Set<string>>>(() => ({
    output: readFavorites('output'),
    input: readFavorites('input'),
  }));
  const timers = useRef<
    Record<Kind, ReturnType<typeof setTimeout> | undefined>
  >({
    output: undefined,
    input: undefined,
  });

  // All state updates live in deferred promise callbacks, so this is safe to
  // call straight from an effect without tripping set-state-in-effect.
  function load() {
    return Promise.all([listOutputDevices(), listInputDevices()])
      .then(async ([out, inp]) => {
        const [outputVol, inputVol] = await Promise.all([
          readVolume(getOutputVolume),
          readVolume(getInputVolume),
        ]);
        const empty = out.length === 0 && inp.length === 0;
        dispatch({
          type: 'loaded',
          devices: { output: out, input: inp },
          volumes: { output: outputVol, input: inputVol },
          status: empty ? 'warn' : 'pass',
          message: empty
            ? 'No audio devices found.'
            : `${out.length} output, ${inp.length} input device${
                out.length + inp.length === 1 ? '' : 's'
              }.`,
        });
      })
      .catch((e: unknown) =>
        dispatch({ type: 'loadFailed', message: String(e) }),
      );
  }

  useEffect(() => {
    void load();
  }, []);

  // The backend pushes volume/mute changes (media keys, mixer, other apps) and
  // device changes as events, so we never poll. A pending debounce timer means
  // the user is dragging that slider — skip those so we don't clobber the drag.
  useEffect(() => {
    function applyExternal(kind: Kind, info: VolumeInfo) {
      if (timers.current[kind]) return;
      dispatch({ type: 'externalVolume', kind, info });
    }
    const volSub = listen<VolumeChange>('audio-volume-changed', (e) => {
      applyExternal(e.payload.kind, {
        volume: e.payload.volume,
        muted: e.payload.muted,
      });
    });
    const devSub = listen('audio-devices-changed', () => void load());
    return () => {
      void volSub.then((un) => un());
      void devSub.then((un) => un());
    };
  }, []);

  function onVolume(kind: Kind, percent: number) {
    const cur = volumes[kind];
    dispatch({
      type: 'setVolume',
      kind,
      info: { volume: percent / 100, muted: cur?.muted ?? false },
    });
    if (timers.current[kind]) clearTimeout(timers.current[kind]);
    timers.current[kind] = setTimeout(async () => {
      try {
        await setVolumeFor[kind](percent / 100);
      } catch (e) {
        dispatch({ type: 'notify', status: 'fail', message: String(e) });
      } finally {
        timers.current[kind] = undefined;
      }
    }, WRITE_DEBOUNCE_MS);
  }

  async function onToggleMute(kind: Kind) {
    const cur = volumes[kind];
    if (!cur) return;
    const muted = !cur.muted;
    dispatch({ type: 'setVolume', kind, info: { ...cur, muted } });
    try {
      await setMuteFor[kind](muted);
    } catch (e) {
      dispatch({ type: 'notify', status: 'fail', message: String(e) });
    }
  }

  async function onSelectDevice(kind: Kind, id: string) {
    if (!id || devices[kind].find((d) => d.id === id)?.isDefault) return;
    dispatch({ type: 'beginLoad' });
    try {
      await setDefaultFor[kind](id);
      // Re-read so the slider reflects the newly-default device's own volume.
      await load();
    } catch (e) {
      dispatch({ type: 'loadFailed', message: String(e) });
    }
  }

  function toggleFavorite(kind: Kind, id: string) {
    setFavorites((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(favKey(kind), JSON.stringify([...next]));
      } catch {
        /* storage unavailable; favorites just won't persist */
      }
      return { ...prev, [kind]: next };
    });
  }

  return (
    <FeatureCard
      wide
      title="Sound"
      description="System volume, mute, and default output/input device for the speakers and microphone."
      icon={<Speaker2Regular />}
      status={status}
    >
      <div className={styles.body}>
        <div className={styles.controls}>
          <Button
            size="small"
            disabled={busy}
            onClick={() => {
              dispatch({ type: 'beginLoad' });
              void load();
            }}
          >
            Refresh
          </Button>
          {message ? (
            <Caption1
              className={status === 'fail' ? styles.error : styles.message}
            >
              {message}
            </Caption1>
          ) : null}
        </div>

        <div className={styles.grid}>
          <Section
            kind="output"
            label="Output"
            devices={devices.output}
            vol={volumes.output}
            busy={busy}
            favs={favorites.output}
            onSelect={onSelectDevice}
            onToggleMute={onToggleMute}
            onVolume={onVolume}
            onToggleFavorite={toggleFavorite}
            styles={styles}
          />
          <Section
            kind="input"
            label="Input"
            devices={devices.input}
            vol={volumes.input}
            busy={busy}
            favs={favorites.input}
            onSelect={onSelectDevice}
            onToggleMute={onToggleMute}
            onVolume={onVolume}
            onToggleFavorite={toggleFavorite}
            styles={styles}
          />
        </div>
      </div>
    </FeatureCard>
  );
}

interface SectionProps {
  kind: Kind;
  label: string;
  devices: AudioDevice[];
  vol: VolumeInfo | null;
  busy: boolean;
  favs: Set<string>;
  onSelect: (kind: Kind, id: string) => void;
  onToggleMute: (kind: Kind) => void;
  onVolume: (kind: Kind, percent: number) => void;
  onToggleFavorite: (kind: Kind, id: string) => void;
  styles: Styles;
}

function Section({
  kind,
  label,
  devices,
  vol,
  busy,
  favs,
  onSelect,
  onToggleMute,
  onVolume,
  onToggleFavorite,
  styles,
}: SectionProps) {
  const muted = vol?.muted ?? false;
  const ordered = orderDevices(devices, favs);
  return (
    <div className={styles.section}>
      <Body1>{label}</Body1>

      {ordered.length === 0 ? (
        <Caption1 className={styles.empty}>No devices.</Caption1>
      ) : (
        <div className={styles.list}>
          {ordered.map((d) => {
            const isFav = favs.has(d.id);
            return (
              <div
                key={d.id}
                className={mergeClasses(
                  styles.item,
                  d.isDefault && styles.itemDefault,
                )}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSelect(kind, d.id)}
                  title={
                    d.isDefault
                      ? 'Current default'
                      : `Set as default ${label.toLowerCase()}`
                  }
                  className={styles.deviceBtn}
                >
                  <span
                    aria-hidden
                    className={mergeClasses(
                      styles.dot,
                      d.isDefault && styles.dotOn,
                    )}
                  />
                  <span
                    className={mergeClasses(
                      styles.name,
                      d.isDefault && styles.nameDefault,
                    )}
                  >
                    {d.name}
                  </span>
                </button>
                <Button
                  size="small"
                  appearance="subtle"
                  icon={
                    isFav ? (
                      <StarFilled
                        color={tokens.colorPaletteMarigoldForeground1}
                      />
                    ) : (
                      <StarRegular />
                    )
                  }
                  aria-pressed={isFav}
                  aria-label={
                    isFav ? `Unfavorite ${d.name}` : `Favorite ${d.name}`
                  }
                  title={isFav ? 'Unfavorite' : 'Favorite'}
                  onClick={() => onToggleFavorite(kind, d.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {vol ? (
        <div className={styles.volRow}>
          <Button
            size="small"
            appearance="subtle"
            onClick={() => onToggleMute(kind)}
            aria-label={
              muted
                ? `Unmute ${label.toLowerCase()}`
                : `Mute ${label.toLowerCase()}`
            }
            title={muted ? 'Unmute' : 'Mute'}
            icon={
              kind === 'output' ? (
                muted ? (
                  <SpeakerMuteRegular />
                ) : (
                  <Speaker2Regular />
                )
              ) : muted ? (
                <MicOffRegular />
              ) : (
                <MicRegular />
              )
            }
          />
          <Slider
            className={styles.slider}
            min={0}
            max={100}
            value={vpct(vol.volume)}
            onChange={(_, data) => onVolume(kind, data.value)}
            aria-label={`${label} volume`}
          />
          <Caption1 className={styles.volPct}>
            {muted ? 'Muted' : `${vpct(vol.volume)}%`}
          </Caption1>
        </div>
      ) : (
        <Caption1 className={styles.empty}>
          No volume control available.
        </Caption1>
      )}
    </div>
  );
}
