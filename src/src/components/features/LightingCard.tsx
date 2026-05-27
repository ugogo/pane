import { useEffect, useMemo, useState } from "react";
import {
  applyDynamicLighting,
  diagnoseDynamicLighting,
  getDynamicLightingInfo,
  listDynamicLightingDevices,
  listHidDevices,
  setVendorLightingEnabled,
  type DynamicLightingDevice,
  type DynamicLightingDiagnostics,
  type DynamicLightingDeviceInfo,
  type HidDeviceInfo,
} from "../../lib/commands";

type ProbeStatus = "idle" | "pass" | "warn" | "fail";

const MSI_VID = 0x0db0;
const MSI_MYSTIC_LIGHT_PID = 0x0076;

const statusStyles: Record<ProbeStatus, string> = {
  idle: "bg-neutral-100 text-neutral-600",
  pass: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  fail: "bg-rose-100 text-rose-800",
};

function hex4(n: number) {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

function looksInteresting(d: HidDeviceInfo) {
  const vendor = d.manufacturer?.toLowerCase() ?? "";
  const product = d.product?.toLowerCase() ?? "";
  const text = `${vendor} ${product}`;
  return (
    text.includes("logitech") ||
    text.includes("msi") ||
    text.includes("mystic") ||
    text.includes("dx") ||
    text.includes("light")
  );
}

function supportsToggle(d: HidDeviceInfo) {
  return d.vendorId === MSI_VID && d.productId === MSI_MYSTIC_LIGHT_PID;
}

export function LightingCard() {
  const [devices, setDevices] = useState<HidDeviceInfo[]>([]);
  const [dynamicDevices, setDynamicDevices] = useState<DynamicLightingDevice[]>([]);
  const [selectedDynamic, setSelectedDynamic] = useState<string>("");
  const [dynamicColor, setDynamicColor] = useState("#ffffff");
  const [dynamicBrightness, setDynamicBrightness] = useState(0.75);
  const [dynamicInfo, setDynamicInfo] = useState<DynamicLightingDeviceInfo | null>(null);
  const [dynamicDiag, setDynamicDiag] = useState<DynamicLightingDiagnostics | null>(null);
  const [status, setStatus] = useState<ProbeStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  const interesting = useMemo(() => devices.filter(looksInteresting), [devices]);

  function keyFor(d: HidDeviceInfo) {
    return `${d.vendorId}:${d.productId}:${d.path}`;
  }

  async function refresh() {
    setBusy(true);
    try {
      const list = await listHidDevices();
      const dyn = await listDynamicLightingDevices();
      setDevices(list);
      setDynamicDevices(dyn);
      if (!selectedDynamic && dyn.length > 0) setSelectedDynamic(dyn[0].id);
      setStatus("pass");
      setMessage(
        `Found ${list.length} HID devices (${interesting.length} likely relevant) · ${dyn.length} Dynamic Lighting devices.`
      );
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedDynamic) return;
    void (async () => {
      try {
        const info = await getDynamicLightingInfo(selectedDynamic);
        setDynamicInfo(info);
        setDynamicDiag(null);
        // We can only reliably read brightness; color readback isn't exposed by LampArray.
        if (Number.isFinite(info.brightness)) {
          setDynamicBrightness(Math.min(1, Math.max(0, info.brightness)));
        }
      } catch (e) {
        setDynamicInfo(null);
        setDynamicDiag(null);
      }
    })();
  }, [selectedDynamic]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleDevice(d: HidDeviceInfo, enabled: boolean) {
    setBusy(true);
    try {
      const res = await setVendorLightingEnabled(d.vendorId, d.productId, enabled);
      setToggles((prev) => ({ ...prev, [keyFor(d)]: enabled }));
      setStatus(res.attempted ? "pass" : "warn");
      setMessage(res.detail);
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyDynamic() {
    if (!selectedDynamic) return;
    const hex = dynamicColor.startsWith("#") ? dynamicColor.slice(1) : dynamicColor;
    if (hex.length !== 6) {
      setStatus("fail");
      setMessage("Invalid color; expected #RRGGBB.");
      return;
    }
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);

    setBusy(true);
    try {
      const res = await applyDynamicLighting(selectedDynamic, r, g, b, dynamicBrightness);
      setStatus("pass");
      setMessage(res.detail);
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function diagnoseDynamic() {
    if (!selectedDynamic) return;
    setBusy(true);
    try {
      const diag = await diagnoseDynamicLighting(selectedDynamic);
      setDynamicDiag(diag);
      setStatus(diag.isAvailable ? "pass" : "warn");
      setMessage(
        `Diagnostics: available=${String(diag.isAvailable)} · vendor=${diag.hardwareVendorId.toString(
          16
        )} product=${diag.hardwareProductId.toString(16)} · lamps=${diag.lampCount}`
      );
    } catch (e) {
      setDynamicDiag(null);
      setStatus("fail");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col-span-2 rounded-lg border border-line bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Lighting (vendor-native)</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Vendor-native controls (MSI) plus Windows Dynamic Lighting (OS-managed) for compatible devices
            like Logitech LIGHTSYNC.
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}>
          {status}
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
        {message && (
          <p className={`text-xs ${status === "fail" ? "text-rose-600" : "text-neutral-500"}`}>{message}</p>
        )}
      </div>

      {dynamicDevices.length > 0 && (
        <div className="mt-4 rounded-md border border-line bg-white p-3">
          <p className="text-sm font-semibold text-ink">Windows Dynamic Lighting</p>
          <p className="mt-1 text-xs text-neutral-500">
            This uses the OS Dynamic Lighting API. Keep Windows “Dynamic Lighting” enabled for the device.
          </p>
          {dynamicInfo && (
            <p className="mt-1 text-[11px] text-neutral-500">
              {dynamicInfo.kind} · lamps {dynamicInfo.lampCount} · available {String(dynamicInfo.isAvailable)} ·
              enabled {String(dynamicInfo.isEnabled)} · connected {String(dynamicInfo.isConnected)}
            </p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-neutral-600">Device</label>
              <select
                className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink"
                value={selectedDynamic}
                onChange={(e) => setSelectedDynamic(e.target.value)}
              >
                {dynamicDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-neutral-600">Color</label>
              <input
                type="color"
                className="mt-1 h-9 w-full rounded-md border border-line bg-white p-1"
                value={dynamicColor}
                onChange={(e) => setDynamicColor(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-neutral-600">
                Brightness ({Math.round(dynamicBrightness * 100)}%)
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={dynamicBrightness}
                onChange={(e) => setDynamicBrightness(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </div>

            <div className="flex items-end">
              <div className="grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || !selectedDynamic}
                  className="h-9 w-full rounded-md border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-neutral-50 disabled:opacity-50"
                  onClick={() => void applyDynamic()}
                >
                  Apply
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedDynamic}
                  className="h-9 w-full rounded-md border border-line bg-white px-3 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                  onClick={() => void diagnoseDynamic()}
                >
                  Diagnose
                </button>
              </div>
            </div>
          </div>

          {dynamicDiag && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-line bg-neutral-50 p-2 text-[11px] text-neutral-700">
              {JSON.stringify(dynamicDiag, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(interesting.length > 0 ? interesting : devices.slice(0, 8)).map((d) => (
          <div key={keyFor(d)} className="rounded-md border border-line p-3">
            <p className="text-sm font-medium text-ink">
              {d.product ?? "Unknown device"}{" "}
              <span className="font-mono text-xs text-neutral-500">
                {hex4(d.vendorId)}:{hex4(d.productId)}
              </span>
            </p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <p className="text-xs text-neutral-500">
                {d.manufacturer ?? "Unknown manufacturer"}
                {d.interfaceNumber != null ? ` · iface ${d.interfaceNumber}` : ""}
                {d.usagePage != null && d.usage != null ? ` · usage ${hex4(d.usagePage)}:${hex4(d.usage)}` : ""}
              </p>
              {supportsToggle(d) && (
                <div className="shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-ink hover:bg-neutral-50 disabled:opacity-50"
                    onClick={() => void toggleDevice(d, !(toggles[keyFor(d)] ?? true))}
                    title="Vendor-native toggle (where supported)"
                  >
                    {(toggles[keyFor(d)] ?? true) ? "Turn off" : "Turn on"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {interesting.length === 0 && devices.length > 8 && (
        <p className="mt-3 text-xs text-neutral-500">
          Showing first 8 devices. Refresh after plugging in the mouse receiver / DxLight to spot new entries.
        </p>
      )}
    </div>
  );
}

