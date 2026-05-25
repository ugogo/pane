using DXLight.Core;

namespace Home.Core.Modules;

public sealed class DxLightModule : IHomeModule
{
    private readonly LightController _controller;

    public DxLightModule(LightController controller)
    {
        _controller = controller;
    }

    public string Id => HomeServiceCollectionExtensions.DxLightModuleId;

    public string DisplayName => "DX Light";

    public string Description => "Control the Robobloq DX Light USB bar.";

    public bool IsEnabled { get; private set; }

    public ModuleStatus Status { get; private set; } = ModuleStatus.Disabled;

    public Type? SettingsPageType => null;

    public Task EnableAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _controller.Start();
        IsEnabled = true;
        Status = ModuleStatus.Running("USB polling active");
        return Task.CompletedTask;
    }

    public Task DisableAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _controller.Stop();
        IsEnabled = false;
        Status = ModuleStatus.Disabled;
        return Task.CompletedTask;
    }
}
