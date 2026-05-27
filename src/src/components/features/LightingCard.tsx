import { useEffect, useMemo, useState } from "react";
import { listHidDevices, setVendorLightingEnabled, type HidDeviceInfo } from "../../lib/commands";

type ProbeStatus = "idle" | "pass" | "warn" | "fail";

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

export function LightingCard() {
  const [devices, setDevices] = useState<HidDeviceInfo[]>([]);
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
      setDevices(list);
      setStatus("pass");
      setMessage(`Found ${list.length} HID devices (${interesting.length} likely relevant).`);
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <div className="col-span-2 rounded-lg border border-line bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Lighting (vendor-native)</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Enumerates local HID devices so we can target MSI Mystic Light, Logitech HID++, and DxLight
            directly without OpenRGB.
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
              {(d.manufacturer?.toLowerCase().includes("msi") ||
                d.product?.toLowerCase().includes("mystic light") ||
                d.product?.toLowerCase().includes("usb receiver")) && (
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

