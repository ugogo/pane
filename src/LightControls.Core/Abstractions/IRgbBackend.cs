using LightControls.Core.Models;

namespace LightControls.Core.Abstractions;

public interface IRgbBackend
{
    Task<bool> IsServerReachableAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<RgbDevice>> GetDevicesAsync(CancellationToken cancellationToken = default);

    Task<ApplyColorResult> ApplyColorAsync(
        IReadOnlyCollection<DeviceColorApply> applies,
        CancellationToken cancellationToken = default);
}
