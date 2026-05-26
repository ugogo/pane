using CommunityToolkit.Mvvm.ComponentModel;
using Home.Core;
using Home.Core.Modules;
using LightControls.Core;
using LightControls.Core.Models;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;

namespace Home.Hub.ViewModels;

public sealed partial class HomePageViewModel : ObservableObject, IDisposable
{
    private readonly MainViewModel _mainViewModel;
    private readonly LightControlsModule _lightControlsModule;
    private readonly DispatcherQueue _dispatcher;

    public HomePageViewModel(
        MainViewModel mainViewModel,
        LightControlsModule lightControlsModule,
        DispatcherQueue dispatcher)
    {
        _mainViewModel = mainViewModel;
        _lightControlsModule = lightControlsModule;
        _dispatcher = dispatcher;
        _lightControlsModule.DevicesChanged += OnLightingChanged;
    }

    public MainViewModel MainViewModel => _mainViewModel;

    public IReadOnlyList<ModuleItemViewModel> Modules => _mainViewModel.Modules;

    public string? HotkeyConflictText => _mainViewModel.HotkeyConflictText;

    public Visibility HotkeyConflictVisibility => _mainViewModel.HotkeyConflictVisibility;

    public IReadOnlyList<ConnectedDeviceItemViewModel> ConnectedDevices =>
        _lightControlsModule.IsEnabled
            ? _lightControlsModule.Devices
                .Select(device => new ConnectedDeviceItemViewModel(device.Name, device.IsSupported))
                .ToList()
            : [];

    public LightingScene? ActiveScene =>
        _lightControlsModule.IsEnabled ? _lightControlsModule.ActiveScene : null;

    public string ActiveSceneName => ActiveScene?.Name ?? "No scene";

    public string ActiveSceneDescription => ActiveScene?.Description ?? "Enable Light Controls to manage scenes.";

    public string ActiveSceneColorHex => ActiveScene?.ColorHex ?? "#FF6A00";

    public string ActiveSceneGlyph => ActiveScene?.IconGlyph ?? "\uE706";

    public string DeviceActivitySummary
    {
        get
        {
            var devices = ConnectedDevices;
            if (devices.Count == 0)
            {
                return "0 active";
            }

            var active = devices.Count(device => device.IsActive);
            return $"{active}/{devices.Count} active";
        }
    }

    public int ConnectedDeviceCount => ConnectedDevices.Count;

    public int ActiveDeviceCount => ConnectedDevices.Count(device => device.IsActive);

    public string ConnectedDeviceStatusText =>
        ConnectedDeviceCount == 0
            ? "No devices"
            : ActiveDeviceCount == ConnectedDeviceCount
                ? "All online"
                : $"{ActiveDeviceCount} online";

    public int ActiveZoneCount =>
        _lightControlsModule.IsEnabled
            ? _lightControlsModule.Devices
                .Where(device => device.IsSupported)
                .Sum(device => Math.Max(device.ZoneCount, 1))
            : 0;

    public int EnabledModuleCount => _mainViewModel.Modules.Count(module => module.IsEnabled);

    public bool MasterSwitchOn =>
        _lightControlsModule.IsEnabled && _lightControlsModule.LightsOn;

    public bool IsMasterSwitchEnabled => _lightControlsModule.IsEnabled && _lightControlsModule.IsMainUiReady;

    public int GlobalBrightness =>
        _lightControlsModule.IsEnabled
            ? Math.Clamp(_lightControlsModule.GlobalBrightness, 1, 100)
            : 0;

    public string GlobalBrightnessText => $"{GlobalBrightness}%";

    public string SystemStatusText
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(_mainViewModel.HotkeyConflictText))
            {
                return "Hotkey conflict";
            }

            var lightModule = _mainViewModel.Modules.FirstOrDefault(m =>
                m.Id == HomeServiceCollectionExtensions.LightControlsModuleId);
            if (lightModule?.IsEnabled == true)
            {
                if (!_lightControlsModule.IsMainUiReady)
                {
                    return "Setup needed";
                }

                if (_lightControlsModule.Devices.Count == 0)
                {
                    return "No devices detected";
                }
            }

            var enabledCount = _mainViewModel.Modules.Count(m => m.IsEnabled);
            return enabledCount > 0 ? "All systems active" : "Utilities paused";
        }
    }

    public bool SystemStatusIsHealthy =>
        string.Equals(SystemStatusText, "All systems active", StringComparison.Ordinal);

    public bool SystemStatusIsWarning =>
        SystemStatusText is "Hotkey conflict" or "Setup needed" or "No devices detected";

    public void Refresh()
    {
        OnPropertyChanged(nameof(ConnectedDevices));
        OnPropertyChanged(nameof(ActiveScene));
        OnPropertyChanged(nameof(ActiveSceneName));
        OnPropertyChanged(nameof(ActiveSceneDescription));
        OnPropertyChanged(nameof(ActiveSceneColorHex));
        OnPropertyChanged(nameof(ActiveSceneGlyph));
        OnPropertyChanged(nameof(DeviceActivitySummary));
        OnPropertyChanged(nameof(ConnectedDeviceCount));
        OnPropertyChanged(nameof(ActiveDeviceCount));
        OnPropertyChanged(nameof(ConnectedDeviceStatusText));
        OnPropertyChanged(nameof(ActiveZoneCount));
        OnPropertyChanged(nameof(EnabledModuleCount));
        OnPropertyChanged(nameof(MasterSwitchOn));
        OnPropertyChanged(nameof(IsMasterSwitchEnabled));
        OnPropertyChanged(nameof(GlobalBrightness));
        OnPropertyChanged(nameof(GlobalBrightnessText));
        OnPropertyChanged(nameof(SystemStatusText));
        OnPropertyChanged(nameof(SystemStatusIsHealthy));
        OnPropertyChanged(nameof(SystemStatusIsWarning));
        OnPropertyChanged(nameof(HotkeyConflictText));
        OnPropertyChanged(nameof(HotkeyConflictVisibility));
    }

    public async Task<string> SetMasterSwitchAsync(bool on) =>
        await _lightControlsModule.SetMasterSwitchAsync(on);

    public async Task<string> SetGlobalBrightnessAsync(int percent) =>
        await _lightControlsModule.SetGlobalBrightnessAsync(percent);

    public async Task<string> UpdateActiveSceneAsync(string colorHex, int brightness) =>
        await _lightControlsModule.UpdateActiveSceneAsync(colorHex, brightness);

    public void Dispose() => _lightControlsModule.DevicesChanged -= OnLightingChanged;

    private void OnLightingChanged() => _dispatcher.TryEnqueue(Refresh);
}

public sealed class ConnectedDeviceItemViewModel
{
    public ConnectedDeviceItemViewModel(string name, bool isActive)
    {
        Name = name;
        ShortName = TrimDeviceName(name);
        IsActive = isActive;
    }

    public string Name { get; }

    public string ShortName { get; }

    public bool IsActive { get; }

    public Visibility ActiveVisibility => IsActive ? Visibility.Visible : Visibility.Collapsed;

    private static string TrimDeviceName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return name;
        }

        var parenIndex = name.IndexOf('(');
        if (parenIndex > 0)
        {
            name = name[..parenIndex].Trim();
        }

        if (name.Length > 28)
        {
            return name[..25] + "...";
        }

        return name;
    }
}
