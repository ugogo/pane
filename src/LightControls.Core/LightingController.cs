using LightControls.Core.Abstractions;
using LightControls.Core.Models;
using LightControls.Core.Settings;

namespace LightControls.Core;

public sealed class LightingController(IRgbBackend backend, SettingsStore settingsStore, LightControlsSettings settings)
{
    public async Task<ApplyColorResult> ApplyToSelectedDevicesAsync(RgbColor color, CancellationToken cancellationToken = default)
    {
        var applies = settings.SelectedDeviceIds
            .Select(deviceId =>
            {
                var deviceSettings = settings.GetOrCreateDeviceSettings(deviceId);
                deviceSettings.Color = color.ToHex();
                return new DeviceColorApply(deviceId, color, deviceSettings.Brightness);
            })
            .ToArray();

        var result = await backend.ApplyColorAsync(applies, cancellationToken);
        settings.LastColor = color.ToHex();
        await settingsStore.SaveAsync(settings, cancellationToken);
        return result;
    }
}
