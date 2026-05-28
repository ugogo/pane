import { useEffect, useMemo, useState } from "react";
import { Cpu, Lightbulb, Monitor, Mouse, type LucideIcon } from "lucide-react";
import {
  applyDxLight,
  applyDynamicLighting,
  applyMsiLighting,
  detectDxLight,
  detectMsiLighting,
  dxLightOff,
  getDynamicLightingStatus,
  getLightStates,
  listDynamicLightingDevices,
  restoreAllLights,
  type DynamicLightingDevice,
  type LightState,
} from "../../lib/commands";

type ProbeStatus = "idle" | "pass" | "warn" | "fail" | "disabled";

const statusStyles: Record<ProbeStatus, string> = {
  idle: "bg-neutral-100 text-neutral-600",
  pass: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  fail: "bg-rose-100 text-rose-800",
  disabled: "bg-neutral-200 text-neutral-600",
};

// A "light" is anything we can paint a color onto. We normalize all three
// sources (Windows Dynamic Lighting devices, MSI Mystic Light, DX Light) into
// this discriminated union so the UI can render them with the same row layout.
type Light =
  | { kind: "dynamic"; id: string; device: DynamicLightingDevice }
  | { kind: "msi" }
  | { kind: "dxlight" };

function lightKey(l: Light) {
  return l.kind === "dynamic" ? `dynamic:${l.id}` : l.kind;
}

function lightTitle(l: Light) {
  switch (l.kind) {
    case "dynamic":
      return l.device.name;
    case "msi":
      return "MSI motherboard";
    case "dxlight":
      return "DX Light strip";
  }
}

function lightSubtitle(l: Light) {
  switch (l.kind) {
    case "dynamic":
      return "Windows Dynamic Lighting";
    case "msi":
      return "Mystic Light ARGB headers";
    case "dxlight":
      return "Robobloq monitor bias strip";
  }
}

function lightIcon(l: Light): LucideIcon {
  switch (l.kind) {
    case "dynamic":
      return Mouse;
    case "msi":
      return Cpu;
    case "dxlight":
      return Monitor;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const stripped = hex.startsWith("#") ? hex.slice(1) : hex;
  if (stripped.length !== 6) return null;
  const r = Number.parseInt(stripped.slice(0, 2), 16);
  const g = Number.parseInt(stripped.slice(2, 4), 16);
  const b = Number.parseInt(stripped.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number) {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface LightRowProps {
  light: Light;
  initialState?: LightState;
  disabledReason?: string;
}

function LightRow({ light, initialState, disabledReason }: LightRowProps) {
  const Icon = lightIcon(light);
  // Lazy initializers so the persisted state seeds the controls once, on
  // first mount. Subsequent refreshes don't clobber user input.
  const [color, setColor] = useState<string>(() =>
    initialState ? rgbToHex(initialState.r, initialState.g, initialState.b) : "#ffffff",
  );
  const [brightness, setBrightness] = useState<number>(() => {
    if (!initialState) return 0.75;
    // If the user last turned this off, fall back to a sane default so they
    // can hit Apply without having to also drag the slider up.
    return initialState.on && initialState.brightness > 0 ? initialState.brightness : 0.75;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [status, setStatus] = useState<ProbeStatus>("idle");
  const disabled = Boolean(disabledReason);
  const visibleStatus = disabled ? "disabled" : status;

  async function apply() {
    if (disabled) return;
    const rgb = hexToRgb(color);
    if (!rgb) {
      setStatus("fail");
      setMessage("Invalid color (expected #RRGGBB).");
      return;
    }
    setBusy(true);
    setStatus("idle");
    try {
      switch (light.kind) {
        case "dynamic": {
          const res = await applyDynamicLighting(light.id, rgb.r, rgb.g, rgb.b, brightness);
          setMessage(res.detail);
          break;
        }
        case "msi": {
          await applyMsiLighting(rgb.r, rgb.g, rgb.b, brightness);
          setMessage(`MSI: rgb(${rgb.r},${rgb.g},${rgb.b}) at ${Math.round(brightness * 100)}%.`);
          break;
        }
        case "dxlight": {
          await applyDxLight(rgb.r, rgb.g, rgb.b, brightness);
          setMessage(`DX Light: rgb(${rgb.r},${rgb.g},${rgb.b}) at ${Math.round(brightness * 100)}%.`);
          break;
        }
      }
      setStatus("pass");
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (disabled) return;
    setBusy(true);
    setStatus("idle");
    try {
      switch (light.kind) {
        case "dynamic":
          // No dedicated off — paint black at 0% brightness.
          await applyDynamicLighting(light.id, 0, 0, 0, 0);
          break;
        case "msi":
          await applyMsiLighting(0, 0, 0, 0);
          break;
        case "dxlight":
          await dxLightOff();
          break;
      }
      setMessage("Off.");
      setStatus("pass");
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-neutral-50 text-neutral-600">
          <Icon size={16} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{lightTitle(light)}</p>
          <p className="truncate text-xs text-neutral-500">{lightSubtitle(light)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[visibleStatus]}`}>
          {visibleStatus}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto_auto]">
        <input
          type="color"
          aria-label={`Color for ${lightTitle(light)}`}
          disabled={disabled}
          className="h-9 w-12 rounded-md border border-line bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-neutral-600">
            Brightness {Math.round(brightness * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            disabled={disabled}
            className="w-full disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        <button
          type="button"
          disabled={busy || disabled}
          className="h-9 rounded-md border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void apply()}
        >
          Apply
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          className="h-9 rounded-md border border-line bg-white px-3 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void turnOff()}
        >
          Off
        </button>
      </div>

      {disabledReason && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {disabledReason}
        </p>
      )}

      {message && (
        <p
          className={`mt-2 text-[11px] ${status === "fail" ? "text-rose-600" : "text-neutral-500"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export function LightingCard() {
  const [lights, setLights] = useState<Light[]>([]);
  const [savedStates, setSavedStates] = useState<Record<string, LightState>>({});
  const [scanStatus, setScanStatus] = useState<ProbeStatus>("idle");
  const [scanMessage, setScanMessage] = useState<string>("");
  const [dynamicLightingDisabledReason, setDynamicLightingDisabledReason] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setScanStatus("idle");
    try {
      const [dynamic, msi, dxlight, states] = await Promise.all([
        Promise.all([
          getDynamicLightingStatus(),
          listDynamicLightingDevices().catch(() => []),
        ])
          .then(([status, devices]) => {
            const reason = status.canControl ? "" : (status.reason ?? "");
            setDynamicLightingDisabledReason(reason);
            return devices;
          })
          .catch((e) => {
            setDynamicLightingDisabledReason("");
            setScanStatus("warn");
            setScanMessage(String(e));
            return [];
          }),
        detectMsiLighting().catch(() => ({ present: false, vendorId: 0, productId: 0 })),
        detectDxLight().catch(() => ({ present: false, vendorId: 0, productId: 0 })),
        getLightStates().catch(() => ({}) as Record<string, LightState>),
      ]);

      const collected: Light[] = [
        ...dynamic.map((d) => ({ kind: "dynamic" as const, id: d.id, device: d })),
        ...(msi.present ? [{ kind: "msi" as const }] : []),
        ...(dxlight.present ? [{ kind: "dxlight" as const }] : []),
      ];

      setSavedStates(states);
      setLights(collected);
      setScanStatus(collected.length > 0 ? "pass" : "warn");
      setScanMessage(
        collected.length === 0
          ? "No controllable lights detected."
          : `${collected.length} light${collected.length === 1 ? "" : "s"} detected.`,
      );
    } catch (e) {
      setScanStatus("fail");
      setScanMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const results = await restoreAllLights();
      const errors = results.filter(([, err]) => err !== null);
      if (errors.length === 0) {
        setScanStatus("pass");
        setScanMessage(`Restored ${results.length} light${results.length === 1 ? "" : "s"}.`);
      } else {
        setScanStatus("warn");
        setScanMessage(
          `Restored ${results.length - errors.length}/${results.length}; failed: ${errors
            .map(([k, e]) => `${k} (${e})`)
            .join(", ")}`,
        );
      }
    } catch (e) {
      setScanStatus("fail");
      setScanMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Stable key list so React doesn't re-mount rows on every refresh.
  const keyedLights = useMemo(() => lights.map((l) => ({ key: lightKey(l), light: l })), [lights]);

  return (
    <div className="col-span-2 rounded-lg border border-line bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <Lightbulb size={16} className="text-accent" aria-hidden />
            Lights
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Per-device color and brightness for Windows Dynamic Lighting, MSI Mystic Light, and the
            DX Light monitor bias strip.
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[scanStatus]}`}>
          {scanStatus}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
        <button
          type="button"
          disabled={busy || keyedLights.length === 0}
          className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void restore()}
          title="Re-apply the last saved color/brightness to every light"
        >
          Restore
        </button>
        {scanMessage && (
          <p className={`text-xs ${scanStatus === "fail" ? "text-rose-600" : "text-neutral-500"}`}>
            {scanMessage}
          </p>
        )}
      </div>
      <div className="mt-4 grid gap-3">
        {keyedLights.map(({ key, light }) => (
          <LightRow
            key={key}
            light={light}
            initialState={savedStates[key]}
            disabledReason={light.kind === "dynamic" ? dynamicLightingDisabledReason : undefined}
          />
        ))}
      </div>
    </div>
  );
}
