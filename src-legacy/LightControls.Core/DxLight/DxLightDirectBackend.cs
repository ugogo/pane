using DXLight.Core;
using LightControls.Core.Abstractions;
using LightControls.Core.Models;
using LightControls.Core.Settings;

namespace LightControls.Core.DxLight;

public sealed class DxLightDirectBackend(LightControlsSettings settings) : IRgbBackend
{
    public Task<bool> IsServerReachableAsync(CancellationToken cancellationToken = default)
    {
        if (!settings.EnableDxLightDirect)
        {
            return Task.FromResult(false);
        }

        return Task.Run(() => DeviceDiscovery.DiscoverPreferred() is not null, cancellationToken);
    }

    public Task<IReadOnlyList<RgbDevice>> GetDevicesAsync(CancellationToken cancellationToken = default)
    {
        if (!settings.EnableDxLightDirect)
        {
            return Task.FromResult<IReadOnlyList<RgbDevice>>([]);
        }

        return Task.Run<IReadOnlyList<RgbDevice>>(() =>
        {
            var discovered = DeviceDiscovery.DiscoverPreferred();
            if (discovered is null)
            {
                return [];
            }

            var displayName = string.IsNullOrWhiteSpace(discovered.DisplayName)
                ? DxLightDeviceIds.DefaultName
                : discovered.DisplayName;

            return
            [
                new RgbDevice(
                    DxLightDeviceIds.DeviceId,
                    -1,
                    displayName,
                    "Robobloq",
                    "Monitor light bar (direct USB HID)",
                    string.Empty,
                    discovered.Path,
                    DeviceSession.DefaultLampsAmount,
                    true,
                    "Ready")
            ];
        }, cancellationToken);
    }

    public Task<ApplyColorResult> ApplyColorAsync(
        IReadOnlyCollection<DeviceColorApply> applies,
        CancellationToken cancellationToken = default)
    {
        var apply = applies.FirstOrDefault(candidate =>
            string.Equals(candidate.DeviceId, DxLightDeviceIds.DeviceId, StringComparison.Ordinal));
        if (!settings.EnableDxLightDirect || apply is null)
        {
            return Task.FromResult(ApplyColorResult.Empty);
        }

        return Task.Run(() =>
        {
            var deviceName = DxLightDeviceIds.DefaultName;
            try
            {
                var discovered = DeviceDiscovery.DiscoverPreferred();
                if (discovered is null)
                {
                    return FailedResult(deviceName, "DX Light strip not found. Check the USB connection.");
                }

                if (!string.IsNullOrWhiteSpace(discovered.DisplayName))
                {
                    deviceName = discovered.DisplayName;
                }

                var dxColor = new DXLight.Core.RgbColor(apply.Color.Red, apply.Color.Green, apply.Color.Blue);
                var brightness = Math.Clamp(apply.BrightnessPercent, 1, 100) / 100.0;

                DeviceSession.WithTransport((transport, info) =>
                {
                    DeviceSession.TurnOn(transport, info.LampsAmount, dxColor, brightness);
                    return true;
                }, discovered, settleDelaySeconds: 0.05);

                return new ApplyColorResult(
                [
                    new DeviceApplyResult(
                        DxLightDeviceIds.DeviceId,
                        deviceName,
                        true,
                        "Applied")
                ]);
            }
            catch (DeviceTransportException ex)
            {
                return FailedResult(deviceName, ex.Message);
            }
            catch (Exception ex)
            {
                return FailedResult(deviceName, ex.Message);
            }
        }, cancellationToken);
    }

    private static ApplyColorResult FailedResult(string deviceName, string message)
    {
        return new ApplyColorResult(
        [
            new DeviceApplyResult(
                DxLightDeviceIds.DeviceId,
                deviceName,
                false,
                message)
        ]);
    }
}
