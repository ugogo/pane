using LightControls.Core;
using LightControls.Core.Abstractions;
using LightControls.Core.Logitech;
using LightControls.Core.OpenRgb;
using LightControls.Core.Settings;

namespace Home.Core.Modules;

public sealed class LightControlsModule : IHomeModule, IDisposable
{
    private readonly SettingsStore _settingsStore = new();
    private LightControlsSettings _settings = new();
    private OpenRgbBackend? _openRgbBackend;
    private LogitechDirectBackend? _logitechBackend;
    private CompositeRgbBackend? _backend;

    public string Id => HomeServiceCollectionExtensions.LightControlsModuleId;

    public string DisplayName => "Light Controls";

    public string Description => "RGB lighting via OpenRGB and Logitech direct control.";

    public bool IsEnabled { get; private set; }

    public ModuleStatus Status { get; private set; } = ModuleStatus.Disabled;

    public Type? SettingsPageType => null;

    public async Task EnableAsync(CancellationToken cancellationToken = default)
    {
        _settings = await _settingsStore.LoadAsync(cancellationToken);
        _settings.EnableDxLightDirect = false;

        _openRgbBackend = new OpenRgbBackend(_settings);
        _logitechBackend = new LogitechDirectBackend(_settings);
        _backend = new CompositeRgbBackend(_openRgbBackend, _logitechBackend);

        var reachable = await _backend.IsServerReachableAsync(cancellationToken);
        IsEnabled = true;
        Status = reachable
            ? ModuleStatus.Running("Backends connected")
            : ModuleStatus.Running("Enabled — no devices detected yet");
    }

    public Task DisableAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        DisposeBackends();
        IsEnabled = false;
        Status = ModuleStatus.Disabled;
        return Task.CompletedTask;
    }

    public IRgbBackend? Backend => _backend;

    public LightControlsSettings Settings => _settings;

    public SettingsStore SettingsStore => _settingsStore;

    public void Dispose()
    {
        DisposeBackends();
    }

    private void DisposeBackends()
    {
        _logitechBackend?.Dispose();
        _logitechBackend = null;
        _openRgbBackend = null;
        _backend = null;
    }
}
