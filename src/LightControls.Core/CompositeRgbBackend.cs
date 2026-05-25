using LightControls.Core.Abstractions;
using LightControls.Core.Models;

namespace LightControls.Core;

public sealed class CompositeRgbBackend(params IRgbBackend[] backends) : IRgbBackend
{
    private readonly IRgbBackend[] _backends = backends;

    public async Task<bool> IsServerReachableAsync(CancellationToken cancellationToken = default)
    {
        foreach (var backend in _backends)
        {
            if (await backend.IsServerReachableAsync(cancellationToken))
            {
                return true;
            }
        }

        return false;
    }

    public async Task<IReadOnlyList<RgbDevice>> GetDevicesAsync(CancellationToken cancellationToken = default)
    {
        var devices = new List<RgbDevice>();
        foreach (var backend in _backends)
        {
            var batch = await backend.GetDevicesAsync(cancellationToken);
            devices.AddRange(batch);
        }

        return devices;
    }

    public async Task<ApplyColorResult> ApplyColorAsync(
        IReadOnlyCollection<DeviceColorApply> applies,
        CancellationToken cancellationToken = default)
    {
        var results = new List<DeviceApplyResult>();
        foreach (var backend in _backends)
        {
            var batch = await backend.ApplyColorAsync(applies, cancellationToken);
            results.AddRange(batch.Devices);
        }

        return new ApplyColorResult(results);
    }
}
