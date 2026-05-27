using LightControls.Core.Abstractions;
using LightControls.Core.Logitech.Hidpp20;
using LightControls.Core.Models;
using LightControls.Core.Settings;

namespace LightControls.Core.Logitech;

public sealed class LogitechDirectBackend(LightControlsSettings settings) : IRgbBackend, IDisposable
{
    private readonly LogitechMouseLightingHost _lightingHost = new();

    public Task<bool> IsServerReachableAsync(CancellationToken cancellationToken = default)
    {
        if (!settings.EnableLogitechDirect)
        {
            return Task.FromResult(false);
        }

        if (_lightingHost.HoldsOpenSession)
        {
            return Task.FromResult(true);
        }

        return Task.Run(() => Hidpp20Session.IsDevicePresent(), cancellationToken);
    }

    public Task<IReadOnlyList<RgbDevice>> GetDevicesAsync(CancellationToken cancellationToken = default)
    {
        if (!settings.EnableLogitechDirect)
        {
            return Task.FromResult<IReadOnlyList<RgbDevice>>([]);
        }

        if (_lightingHost.HoldsOpenSession)
        {
            return Task.FromResult<IReadOnlyList<RgbDevice>>([CreateDevice()]);
        }

        return Task.Run<IReadOnlyList<RgbDevice>>(() =>
            Hidpp20Session.IsDevicePresent() ? [CreateDevice()] : [],
            cancellationToken);
    }

    public Task<ApplyColorResult> ApplyColorAsync(
        IReadOnlyCollection<DeviceColorApply> applies,
        CancellationToken cancellationToken = default)
    {
        var apply = applies.FirstOrDefault(candidate =>
            string.Equals(candidate.DeviceId, LogitechDeviceIds.ProX2Superlight2DeviceId, StringComparison.Ordinal));
        if (!settings.EnableLogitechDirect || apply is null)
        {
            return Task.FromResult(ApplyColorResult.Empty);
        }

        return Task.Run(() =>
        {
            var succeeded = _lightingHost.Apply(apply, out var error);
            return new ApplyColorResult(
            [
                new DeviceApplyResult(
                    LogitechDeviceIds.ProX2Superlight2DeviceId,
                    LogitechDeviceIds.ProX2Superlight2Name,
                    succeeded,
                    succeeded ? "Applied" : error ?? "Failed")
            ]);
        }, cancellationToken);
    }

    public void Dispose()
    {
        _lightingHost.Dispose();
    }

    private static RgbDevice CreateDevice() =>
        new(
            LogitechDeviceIds.ProX2Superlight2DeviceId,
            -1,
            LogitechDeviceIds.ProX2Superlight2Name,
            "Logitech",
            "RGB (direct HID++)",
            string.Empty,
            "HID",
            1,
            true,
            "Ready");
}
