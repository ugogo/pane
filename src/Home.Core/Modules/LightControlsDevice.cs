using LightControls.Core;
using LightControls.Core.Models;
using LightControls.Core.Settings;

namespace Home.Core.Modules;

public sealed class LightControlsDevice
{
    private readonly RgbDevice _device;
    private readonly DeviceLightingSettings _settings;

    public LightControlsDevice(RgbDevice device, DeviceLightingSettings settings)
    {
        _device = device;
        _settings = settings;
    }

    public string Id => _device.Id;

    public string Name => string.IsNullOrWhiteSpace(_device.Vendor)
        ? _device.Name
        : $"{_device.Vendor} {_device.Name}";

    public string Details => _device.Zones.Count > 0
        ? $"{FormatLedCount(_device.LedCount)} · {string.Join(", ", _device.Zones.Select(zone => $"{zone.Name} ({zone.LedCount})"))} · {_device.Status}"
        : $"{FormatLedCount(_device.LedCount)} - {_device.Status}";

    public int ZoneCount => _device.Zones.Count;

    public bool IsSupported => _device.IsSupported;

    public string IconGlyph
    {
        get
        {
            var normalized = $"{_device.Vendor} {_device.Name}".ToLowerInvariant();
            if (normalized.Contains("logitech", StringComparison.Ordinal)
                || normalized.Contains("mouse", StringComparison.Ordinal)
                || normalized.Contains("lightspeed", StringComparison.Ordinal))
            {
                return "\uE962";
            }

            if (normalized.Contains("robobloq", StringComparison.Ordinal)
                || normalized.Contains("dx light", StringComparison.Ordinal)
                || normalized.Contains("light bar", StringComparison.Ordinal))
            {
                return "\uEA80";
            }

            return "\uE950";
        }
    }

    public string ColorHex
    {
        get => _settings.Color;
        set => _settings.Color = RgbColor.FromHex(value).ToHex();
    }

    public int BrightnessPercent
    {
        get => _settings.Brightness;
        set => _settings.Brightness = Math.Clamp(value, 1, 100);
    }

    public DeviceColorApply ToApplyRequest() =>
        new(Id, RgbColor.FromHex(ColorHex), BrightnessPercent);

    private static string FormatLedCount(int count) => count == 1 ? "1 LED" : $"{count} LEDs";
}
