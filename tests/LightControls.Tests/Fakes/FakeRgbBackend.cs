using LightControls.Core.Abstractions;
using LightControls.Core.Models;

namespace LightControls.Tests.Fakes;

internal sealed class FakeRgbBackend : IRgbBackend
{
    public bool ServerReachable { get; set; }

    public List<RgbDevice> Devices { get; } = [];

    public IReadOnlyCollection<DeviceColorApply> LastApplies { get; private set; } = [];

    public Task<bool> IsServerReachableAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(ServerReachable);

    public Task<IReadOnlyList<RgbDevice>> GetDevicesAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<RgbDevice>>(Devices);

    public Task<ApplyColorResult> ApplyColorAsync(
        IReadOnlyCollection<DeviceColorApply> applies,
        CancellationToken cancellationToken = default)
    {
        LastApplies = applies.ToArray();

        var results = applies
            .Select(apply => new DeviceApplyResult(apply.DeviceId, apply.DeviceId, true, "Applied"))
            .ToArray();

        return Task.FromResult(new ApplyColorResult(results));
    }
}
