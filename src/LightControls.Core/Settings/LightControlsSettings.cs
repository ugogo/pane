using LightControls.Core.Models;

namespace LightControls.Core.Settings;

public sealed class LightControlsSettings
{
    public string Host { get; set; } = "127.0.0.1";

    public int Port { get; set; } = 6742;

    public string? OpenRgbExecutablePath { get; set; }

    /// <summary>
    /// When true, detects and controls Logitech PRO X Superlight 2 power LED via direct HID++ (no OpenRGB).
    /// </summary>
    public bool EnableLogitechDirect { get; set; } = true;

    /// <summary>
    /// When true, detects and controls Robobloq DX Light monitor bar via direct USB HID (no OpenRGB).
    /// </summary>
    public bool EnableDxLightDirect { get; set; } = true;

    public string LastColor { get; set; } = "#00A8FF";

    /// <summary>Brightness level applied to devices, 0–100.</summary>
    public int LastBrightness { get; set; } = 100;

    public List<string> SelectedDeviceIds { get; set; } = [];

    /// <summary>Recently picked custom colors, most recent first.</summary>
    public List<string> RecentCustomColors { get; set; } = [];

    /// <summary>When true, register Light Controls to launch when Windows starts.</summary>
    public bool RunAtStartup { get; set; }

    /// <summary>Per-device color and brightness, keyed by device id.</summary>
    public Dictionary<string, DeviceLightingSettings> DeviceSettings { get; set; } = new(StringComparer.Ordinal);

    public DeviceLightingSettings GetOrCreateDeviceSettings(string deviceId)
    {
        if (!DeviceSettings.TryGetValue(deviceId, out var settings))
        {
            settings = new DeviceLightingSettings
            {
                Color = LastColor,
                Brightness = LastBrightness
            };
            DeviceSettings[deviceId] = settings;
        }

        return settings;
    }
}
