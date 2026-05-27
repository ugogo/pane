namespace LightControls.Core.Models;

public sealed record DeviceApplyResult(string DeviceId, string DeviceName, bool Succeeded, string Message);

public sealed record ApplyColorResult(IReadOnlyList<DeviceApplyResult> Devices)
{
    public bool Succeeded => Devices.Count > 0 && Devices.All(device => device.Succeeded);

    public static ApplyColorResult Empty { get; } = new(Array.Empty<DeviceApplyResult>());
}
