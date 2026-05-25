using LightControls.Core;
using LightControls.Core.Abstractions;
using LightControls.Core.DxLight;
using LightControls.Core.Logitech;
using LightControls.Core.Models;
using LightControls.Core.OpenRgb;
using LightControls.Core.Settings;
using LightControls.Core.Setup;

namespace Home.Core.Modules;

public sealed class LightControlsModule : IHomeModule, IDisposable
{
    private readonly SettingsStore _settingsStore = new();
    private readonly List<LightControlsDevice> _devices = [];
    private LightControlsSettings _settings = new();
    private OpenRgbBackend? _openRgbBackend;
    private LogitechDirectBackend? _logitechBackend;
    private DxLightDirectBackend? _dxLightBackend;
    private CompositeRgbBackend? _backend;
    private OpenRgbSetupManager? _setupManager;
    private bool _isMainUiReady;

    public string Id => HomeServiceCollectionExtensions.LightControlsModuleId;

    public string DisplayName => "Light Controls";

    public string Description => "RGB lighting via OpenRGB, Logitech, and DX Light.";

    public bool IsEnabled { get; private set; }

    public ModuleStatus Status { get; private set; } = ModuleStatus.Disabled;

    public Type? SettingsPageType => null;

    public bool IsMainUiReady => _isMainUiReady;

    public IReadOnlyList<LightControlsDevice> Devices => _devices;

    public IRgbBackend? Backend => _backend;

    public LightControlsSettings Settings => _settings;

    public SettingsStore SettingsStore => _settingsStore;

    public OpenRgbSetupManager? SetupManager => _setupManager;

    public async Task EnableAsync(CancellationToken cancellationToken = default)
    {
        _settings = await _settingsStore.LoadAsync(cancellationToken);
        CreateBackends();
        IsEnabled = true;
        Status = ModuleStatus.Running("Enabled");
    }

    public Task DisableAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        DisposeBackends();
        _devices.Clear();
        _isMainUiReady = false;
        IsEnabled = false;
        Status = ModuleStatus.Disabled;
        return Task.CompletedTask;
    }

    public async Task ReloadAsync(CancellationToken cancellationToken = default)
    {
        if (!IsEnabled)
        {
            return;
        }

        await DisableAsync(cancellationToken);
        await EnableAsync(cancellationToken);
    }

    public async Task<string> InitializeUiAsync(
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        EnsureBackends();
        if (_setupManager is null || _backend is null)
        {
            return "Light Controls is not enabled.";
        }

        if (await _backend.IsServerReachableAsync(cancellationToken))
        {
            var status = await _setupManager.GetStatusAsync(cancellationToken);
            if (status.State == OpenRgbSetupState.InstalledButStopped)
            {
                _ = await _setupManager.EnsureServerRunningAsync(progress, cancellationToken);
                await _settingsStore.SaveAsync(_settings, cancellationToken);
            }

            _isMainUiReady = true;
            await RefreshDevicesAsync(cancellationToken);
            Status = BuildDeviceStatus("Lighting support is ready.");
            return Status.Message;
        }

        var setupStatus = await _setupManager.GetStatusAsync(cancellationToken);
        if (setupStatus.State == OpenRgbSetupState.ServerRunning)
        {
            _isMainUiReady = true;
            await RefreshDevicesAsync(cancellationToken);
            Status = BuildDeviceStatus("Lighting support is ready.");
            return Status.Message;
        }

        if (setupStatus.State == OpenRgbSetupState.InstalledButStopped)
        {
            var launchStatus = await _setupManager.EnsureServerRunningAsync(progress, cancellationToken);
            await _settingsStore.SaveAsync(_settings, cancellationToken);
            if (launchStatus.State == OpenRgbSetupState.ServerRunning)
            {
                _isMainUiReady = true;
                await RefreshDevicesAsync(cancellationToken);
                Status = BuildDeviceStatus("Lighting support is ready.");
                return Status.Message;
            }

            _isMainUiReady = false;
            Status = ModuleStatus.Running(launchStatus.Message);
            return launchStatus.Message;
        }

        _isMainUiReady = false;
        Status = ModuleStatus.Running(setupStatus.Message);
        return setupStatus.Message;
    }

    public async Task<string> RunSetupAsync(
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        EnsureBackends();
        if (_setupManager is null)
        {
            return "Light Controls is not enabled.";
        }

        var status = await _setupManager.EnsureServerRunningAsync(progress, cancellationToken);
        await _settingsStore.SaveAsync(_settings, cancellationToken);
        if (status.State == OpenRgbSetupState.ServerRunning)
        {
            _isMainUiReady = true;
            await RefreshDevicesAsync(cancellationToken);
            Status = BuildDeviceStatus("Lighting support is ready.");
            return Status.Message;
        }

        _isMainUiReady = false;
        Status = ModuleStatus.Running(status.Message);
        return status.Message;
    }

    public async Task RefreshDevicesAsync(CancellationToken cancellationToken = default)
    {
        if (_backend is null)
        {
            return;
        }

        var devices = await _backend.GetDevicesAsync(cancellationToken);
        _devices.Clear();

        foreach (var device in devices)
        {
            var deviceSettings = _settings.GetOrCreateDeviceSettings(device.Id);
            _devices.Add(new LightControlsDevice(device, deviceSettings));
        }

        await ResumeSavedLightingAsync(cancellationToken);
        Status = BuildDeviceStatus(Status.Message);
    }

    public async Task<string> ApplyDeviceAsync(string deviceId, CancellationToken cancellationToken = default)
    {
        if (_backend is null)
        {
            return "Backend is not available.";
        }

        var device = _devices.FirstOrDefault(item => item.Id == deviceId);
        if (device is null || !device.IsSupported)
        {
            return "Device is not available.";
        }

        var result = await _backend.ApplyColorAsync([device.ToApplyRequest()], cancellationToken);
        _settings.LastColor = device.ColorHex;
        _settings.LastBrightness = device.BrightnessPercent;
        await _settingsStore.SaveAsync(_settings, cancellationToken);
        return DescribeApplyResult(result, 1, device.Name);
    }

    public async Task<string> ApplyAllSupportedAsync(CancellationToken cancellationToken = default)
    {
        if (_backend is null)
        {
            return "Backend is not available.";
        }

        var applies = _devices.Where(device => device.IsSupported).Select(device => device.ToApplyRequest()).ToList();
        if (applies.Count == 0)
        {
            return "No compatible devices found.";
        }

        var result = await _backend.ApplyColorAsync(applies, cancellationToken);
        var selected = _devices.FirstOrDefault(device => device.IsSupported);
        _settings.LastColor = selected?.ColorHex ?? _settings.LastColor;
        _settings.LastBrightness = selected?.BrightnessPercent ?? _settings.LastBrightness;
        await _settingsStore.SaveAsync(_settings, cancellationToken);
        return DescribeApplyResult(result, applies.Count, null);
    }

    public void RecordRecentCustomColor(string hex)
    {
        var normalized = RgbColor.FromHex(hex).ToHex();
        _settings.RecentCustomColors.RemoveAll(color =>
            string.Equals(color, normalized, StringComparison.OrdinalIgnoreCase));
        _settings.RecentCustomColors.Insert(0, normalized);

        if (_settings.RecentCustomColors.Count > ColorSwatches.MaxRecentCustomColors)
        {
            _settings.RecentCustomColors.RemoveRange(
                ColorSwatches.MaxRecentCustomColors,
                _settings.RecentCustomColors.Count - ColorSwatches.MaxRecentCustomColors);
        }
    }

    public static void OpenOpenRgbReleases() => OpenRgbSetupManager.OpenReleasesPage();

    public void Dispose() => DisposeBackends();

    private void CreateBackends()
    {
        DisposeBackends();
        _openRgbBackend = new OpenRgbBackend(_settings);
        _logitechBackend = new LogitechDirectBackend(_settings);
        _dxLightBackend = new DxLightDirectBackend(_settings);
        _backend = new CompositeRgbBackend(_openRgbBackend, _logitechBackend, _dxLightBackend);
        _setupManager = new OpenRgbSetupManager(_settings, _openRgbBackend);
    }

    private void EnsureBackends()
    {
        if (_backend is not null)
        {
            return;
        }

        if (!IsEnabled)
        {
            throw new InvalidOperationException("Enable Light Controls before using the UI.");
        }

        CreateBackends();
    }

    private async Task ResumeSavedLightingAsync(CancellationToken cancellationToken)
    {
        if (_backend is null)
        {
            return;
        }

        var applies = _devices
            .Where(device => device.IsSupported)
            .Select(device => device.ToApplyRequest())
            .ToList();
        if (applies.Count == 0)
        {
            return;
        }

        try
        {
            await _backend.ApplyColorAsync(applies, cancellationToken);
        }
        catch
        {
        }
    }

    private ModuleStatus BuildDeviceStatus(string message)
    {
        var count = _devices.Count;
        return count == 0
            ? ModuleStatus.Running(string.IsNullOrWhiteSpace(message) ? "No compatible devices were reported." : message)
            : ModuleStatus.Running($"{count} device(s) detected.");
    }

    private static string DescribeApplyResult(ApplyColorResult result, int deviceCount, string? singleDeviceName)
    {
        var failures = result.Devices.Where(device => !device.Succeeded).ToList();
        if (failures.Count == 0)
        {
            return singleDeviceName is null
                ? $"Applied per-device settings to {deviceCount} device(s)."
                : $"Applied settings to {singleDeviceName}.";
        }

        return $"Applied with {failures.Count} device issue(s): {string.Join(", ", failures.Select(failure => failure.DeviceName))}";
    }

    private void DisposeBackends()
    {
        _logitechBackend?.Dispose();
        _logitechBackend = null;
        _dxLightBackend = null;
        _openRgbBackend = null;
        _backend = null;
        _setupManager = null;
    }
}
