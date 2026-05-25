using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using LightControls.Core;
using LightControls.Core.Abstractions;
using LightControls.Core.DxLight;
using LightControls.Core.Logitech;
using LightControls.Core.Models;
using LightControls.Core.OpenRgb;
using LightControls.Core.Settings;
using LightControls.Core.Setup;
using LightControls.Desktop.Startup;
using Forms = System.Windows.Forms;

namespace LightControls.Desktop;

public partial class MainWindow : Window
{
    private readonly SettingsStore _settingsStore = new();
    private readonly DispatcherTimer _brightnessApplyTimer;
    private LightControlsSettings _settings = new();
    private IRgbBackend? _backend;
    private LogitechDirectBackend? _logitechBackend;
    private OpenRgbSetupManager? _setupManager;
    private DeviceItem? _selectedDevice;
    private bool _busy;
    private bool _suppressDevicePanelSync;
    private bool _suppressStartupSync;
    private bool _isExiting;
    private Forms.NotifyIcon? _notifyIcon;

    public ObservableCollection<DeviceItem> Devices { get; } = [];

    public ObservableCollection<SwatchItem> BuiltInSwatches { get; } = [];

    public ObservableCollection<SwatchItem> RecentCustomSwatches { get; } = [];

    public MainWindow()
    {
        InitializeComponent();
        foreach (var hex in ColorSwatches.BuiltIn)
        {
            BuiltInSwatches.Add(new SwatchItem(hex));
        }

        _brightnessApplyTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
        _brightnessApplyTimer.Tick += BrightnessApplyTimer_Tick;

        DataContext = this;
        InitializeTrayIcon();
        ShowSetup("Checking lighting support...");
    }

    private void InitializeTrayIcon()
    {
        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Show Light Controls", null, (_, _) => ShowFromTray());
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => ExitApplication());

        _notifyIcon = new Forms.NotifyIcon
        {
            Icon = TrayIconFactory.Create(),
            Text = "Light Controls",
            Visible = true,
            ContextMenuStrip = menu
        };
        _notifyIcon.DoubleClick += (_, _) => ShowFromTray();
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (_isExiting)
        {
            return;
        }

        e.Cancel = true;
        HideToTray();
    }

    private void Window_StateChanged(object? sender, EventArgs e)
    {
        if (_isExiting || WindowState != WindowState.Minimized)
        {
            return;
        }

        HideToTray();
    }

    private void HideToTray()
    {
        Hide();
        ShowInTaskbar = false;
        WindowState = WindowState.Normal;
    }

    private void ShowFromTray()
    {
        Show();
        WindowState = WindowState.Normal;
        ShowInTaskbar = true;
        Activate();
    }

    public void ActivateFromSecondInstance() => ShowFromTray();

    private void ExitApplication()
    {
        _isExiting = true;
        _brightnessApplyTimer.Stop();

        if (_notifyIcon is not null)
        {
            _notifyIcon.Visible = false;
            _notifyIcon.Dispose();
            _notifyIcon = null;
        }

        _logitechBackend?.Dispose();
        _logitechBackend = null;

        Close();
        System.Windows.Application.Current.Shutdown();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _suppressDevicePanelSync = true;
        _settings = await _settingsStore.LoadAsync();
        var openRgbBackend = new OpenRgbBackend(_settings);
        _logitechBackend = new LogitechDirectBackend(_settings);
        _backend = new CompositeRgbBackend(
            openRgbBackend,
            _logitechBackend,
            new DxLightDirectBackend(_settings));
        _setupManager = new OpenRgbSetupManager(_settings, openRgbBackend);

        LoadRecentCustomSwatches();
        UpdateRecentCustomEmptyState();
        await SyncStartupFromSettingsAsync();
        await InitializeLightingAsync();
        _suppressDevicePanelSync = false;
    }

    private async Task InitializeLightingAsync()
    {
        if (_setupManager is null)
        {
            return;
        }

        await RunBusyAsync("Checking lighting support...", async () =>
        {
            var progress = CreateSetupProgress();
            if (_backend is not null && await _backend.IsServerReachableAsync())
            {
                var status = await _setupManager.GetStatusAsync();
                if (status.State != OpenRgbSetupState.ServerRunning
                    && status.State == OpenRgbSetupState.InstalledButStopped)
                {
                    _ = await _setupManager.EnsureServerRunningAsync(progress);
                    await _settingsStore.SaveAsync(_settings);
                }

                ShowMain("Lighting support is ready.");
                await LoadDevicesAsync();
                return;
            }

            var setupStatus = await _setupManager.GetStatusAsync();
            if (setupStatus.State == OpenRgbSetupState.ServerRunning)
            {
                ShowMain("Lighting support is ready.");
                await LoadDevicesAsync();
                return;
            }

            if (setupStatus.State == OpenRgbSetupState.InstalledButStopped)
            {
                var launchStatus = await _setupManager.EnsureServerRunningAsync(progress);
                await _settingsStore.SaveAsync(_settings);
                if (launchStatus.State == OpenRgbSetupState.ServerRunning)
                {
                    ShowMain("Lighting support is ready.");
                    await LoadDevicesAsync();
                    return;
                }

                ShowSetup(launchStatus.Message);
                return;
            }

            ShowSetup(setupStatus.Message);
        });
    }

    private async Task LoadDevicesAsync()
    {
        if (_backend is null)
        {
            return;
        }

        try
        {
            var devices = await _backend.GetDevicesAsync();
            var previousSelectionId = _selectedDevice?.Id;
            Devices.Clear();

            foreach (var device in devices)
            {
                var deviceSettings = _settings.GetOrCreateDeviceSettings(device.Id);
                Devices.Add(new DeviceItem(device, deviceSettings));
            }

            SelectInitialDevice(previousSelectionId);
            UpdateDevicesPresentation();
            await ResumeSavedLightingAsync();
        }
        catch (Exception ex)
        {
            ShowSetup($"OpenRGB is installed, but the SDK server is not reachable. {ex.Message}");
        }
    }

    private async Task ResumeSavedLightingAsync()
    {
        if (_backend is null)
        {
            return;
        }

        var applies = Devices
            .Where(device => device.IsSupported)
            .Select(device => device.ToApplyRequest())
            .ToList();
        if (applies.Count == 0)
        {
            return;
        }

        try
        {
            await _backend.ApplyColorAsync(applies);
        }
        catch
        {
            // Keep the UI responsive if a backend is temporarily unavailable.
        }
    }

    private void UpdateDevicesPresentation()
    {
        var count = Devices.Count;
        DevicesEmptyPanel.Visibility = count == 0 ? Visibility.Visible : Visibility.Collapsed;
        DevicesListPanel.Visibility = count == 0 ? Visibility.Collapsed : Visibility.Visible;
        StatusText.Text = count == 0
            ? "No compatible devices were reported."
            : $"{count} device(s) detected.";
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync("Refreshing devices...", LoadDevicesAsync);
    }

    private void SelectInitialDevice(string? previousSelectionId)
    {
        var target = Devices.FirstOrDefault(device => device.Id == previousSelectionId && device.IsSupported)
            ?? Devices.FirstOrDefault(device => device.IsSupported)
            ?? Devices.FirstOrDefault();

        if (target is null)
        {
            _selectedDevice = null;
            DevicesListBox.SelectedItem = null;
            UpdateColorPanelEnabled(false);
            return;
        }

        DevicesListBox.SelectedItem = target;
        SelectDevice(target, apply: false);
    }

    private void DevicesListBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (DevicesListBox.SelectedItem is DeviceItem device)
        {
            SelectDevice(device, apply: false);
        }
    }

    private void SelectDevice(DeviceItem device, bool apply)
    {
        _selectedDevice = device;
        _suppressDevicePanelSync = true;
        SyncColorPanelFromDevice(device);
        _suppressDevicePanelSync = false;

        if (apply && MainPanel.Visibility == Visibility.Visible)
        {
            _ = ApplyDeviceAsync(device);
        }
    }

    private void SyncColorPanelFromDevice(DeviceItem device)
    {
        UpdateColorPanelEnabled(device.IsSupported);
        SelectedDeviceText.Text = device.Name;
        SetColorPreview(device.ColorHex);
        BrightnessSlider.Value = Math.Clamp(device.BrightnessPercent, 1, 100);
        UpdateBrightnessLabel();
    }

    private void UpdateColorPanelEnabled(bool enabled)
    {
        BrightnessSlider.IsEnabled = enabled;
        ColorPreviewButton.IsEnabled = enabled;
    }

    private async void ApplyButton_Click(object sender, RoutedEventArgs e)
    {
        await ApplyAllDevicesAsync();
    }

    private async Task SyncStartupFromSettingsAsync()
    {
        _suppressStartupSync = true;
        try
        {
            var exePath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(exePath))
            {
                RunAtStartupCheckBox.IsEnabled = false;
                return;
            }

            var registeredForThisExe = WindowsStartupManager.IsRegisteredFor(exePath);
            if (_settings.RunAtStartup || registeredForThisExe)
            {
                if (!registeredForThisExe)
                {
                    WindowsStartupManager.Enable(exePath);
                }

                if (!_settings.RunAtStartup)
                {
                    _settings.RunAtStartup = true;
                    await _settingsStore.SaveAsync(_settings);
                }

                RunAtStartupCheckBox.IsChecked = true;
                return;
            }

            if (WindowsStartupManager.IsEnabled)
            {
                WindowsStartupManager.Disable();
            }

            RunAtStartupCheckBox.IsChecked = false;
        }
        finally
        {
            _suppressStartupSync = false;
        }
    }

    private async void RunAtStartupCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        if (_suppressStartupSync)
        {
            return;
        }

        var enabled = RunAtStartupCheckBox.IsChecked == true;
        var exePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exePath))
        {
            _suppressStartupSync = true;
            RunAtStartupCheckBox.IsChecked = false;
            _suppressStartupSync = false;
            return;
        }

        try
        {
            if (enabled)
            {
                WindowsStartupManager.Enable(exePath);
            }
            else
            {
                WindowsStartupManager.Disable();
            }

            _settings.RunAtStartup = enabled;
            await _settingsStore.SaveAsync(_settings);
        }
        catch (Exception ex)
        {
            _suppressStartupSync = true;
            RunAtStartupCheckBox.IsChecked = !enabled;
            _suppressStartupSync = false;
            ShowSetup($"Could not update Windows startup: {ex.Message}");
        }
    }

    private async Task ApplyAllDevicesAsync()
    {
        if (_backend is null)
        {
            return;
        }

        var applies = Devices
            .Where(device => device.IsSupported)
            .Select(device => device.ToApplyRequest())
            .ToList();
        if (applies.Count == 0)
        {
            StatusText.Text = "No compatible devices found.";
            return;
        }

        await RunBusyAsync("Applying colors...", async () =>
        {
            var result = await _backend.ApplyColorAsync(applies);
            _settings.LastColor = _selectedDevice?.ColorHex ?? _settings.LastColor;
            _settings.LastBrightness = _selectedDevice?.BrightnessPercent ?? _settings.LastBrightness;
            await _settingsStore.SaveAsync(_settings);
            UpdateStatusFromApplyResult(result, applies.Count);
        });
    }

    private async Task ApplyDeviceAsync(DeviceItem device)
    {
        if (_backend is null || !device.IsSupported)
        {
            return;
        }

        await RunBusyAsync($"Applying to {device.Name}...", async () =>
        {
            var result = await _backend.ApplyColorAsync([device.ToApplyRequest()]);
            _settings.LastColor = device.ColorHex;
            _settings.LastBrightness = device.BrightnessPercent;
            await _settingsStore.SaveAsync(_settings);
            UpdateStatusFromApplyResult(result, 1, device);
        });
    }

    private void UpdateStatusFromApplyResult(ApplyColorResult result, int deviceCount, DeviceItem? singleDevice = null)
    {
        var failures = result.Devices.Where(device => !device.Succeeded).ToList();
        if (failures.Count == 0)
        {
            StatusText.Text = singleDevice is null
                ? $"Applied per-device settings to {deviceCount} device(s)."
                : $"Applied {singleDevice.ColorHex} at {singleDevice.BrightnessPercent}% to {singleDevice.Name}.";
            return;
        }

        StatusText.Text = $"Applied with {failures.Count} device issue(s): {string.Join(", ", failures.Select(failure => failure.DeviceName))}";
    }

    private async void SetupButton_Click(object sender, RoutedEventArgs e)
    {
        if (_setupManager is null)
        {
            return;
        }

        await RunBusyAsync("Setting up lighting support...", async () =>
        {
            var progress = CreateSetupProgress();
            var status = await _setupManager.EnsureServerRunningAsync(progress);
            await _settingsStore.SaveAsync(_settings);
            if (status.State == OpenRgbSetupState.ServerRunning)
            {
                ShowMain("Lighting support is ready.");
                await LoadDevicesAsync();
            }
            else
            {
                ShowSetup(status.Message);
            }
        });
    }

    private async void RetrySetupButton_Click(object sender, RoutedEventArgs e)
    {
        await InitializeLightingAsync();
    }

    private void OpenReleasesButton_Click(object sender, RoutedEventArgs e)
    {
        OpenRgbSetupManager.OpenReleasesPage();
    }

    private async void SwatchButton_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is not string hex)
        {
            return;
        }

        await SelectAndApplyColorAsync(hex);
    }

    private async void CustomSwatchButton_Click(object sender, RoutedEventArgs e)
    {
        await OpenColorPickerAsync();
    }

    private async void ColorPreviewButton_Click(object sender, RoutedEventArgs e)
    {
        await OpenColorPickerAsync();
    }

    private async Task OpenColorPickerAsync()
    {
        if (_selectedDevice is null)
        {
            return;
        }

        var current = RgbColor.FromHex(_selectedDevice.ColorHex);
        using var dialog = new Forms.ColorDialog
        {
            FullOpen = true,
            Color = System.Drawing.Color.FromArgb(current.Red, current.Green, current.Blue)
        };

        if (dialog.ShowDialog() == Forms.DialogResult.OK)
        {
            var hex = new RgbColor(dialog.Color.R, dialog.Color.G, dialog.Color.B).ToHex();
            RecordRecentCustomColor(hex);
            await ApplyColorToSelectedDeviceAsync(hex);
        }
    }

    private async Task SelectAndApplyColorAsync(string hex)
    {
        if (_suppressDevicePanelSync || MainPanel.Visibility != Visibility.Visible || _selectedDevice is null)
        {
            return;
        }

        await ApplyColorToSelectedDeviceAsync(hex);
    }

    private async Task ApplyColorToSelectedDeviceAsync(string hex)
    {
        if (_selectedDevice is null)
        {
            return;
        }

        _selectedDevice.ColorHex = hex;
        SetColorPreview(hex);

        if (MainPanel.Visibility == Visibility.Visible)
        {
            await ApplyDeviceAsync(_selectedDevice);
        }
        else
        {
            await _settingsStore.SaveAsync(_settings);
        }
    }

    private void RecordRecentCustomColor(string hex)
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

        LoadRecentCustomSwatches();
        UpdateRecentCustomEmptyState();
    }

    private void LoadRecentCustomSwatches()
    {
        RecentCustomSwatches.Clear();
        foreach (var hex in _settings.RecentCustomColors)
        {
            RecentCustomSwatches.Add(new SwatchItem(hex));
        }

        UpdateSwatchSelection();
    }

    private void UpdateRecentCustomEmptyState()
    {
        RecentCustomEmptyText.Visibility = RecentCustomSwatches.Count == 0
            ? Visibility.Visible
            : Visibility.Collapsed;
    }

    private void SetColorPreview(string hexColor)
    {
        var color = RgbColor.FromHex(hexColor);
        var wpfColor = System.Windows.Media.Color.FromRgb(color.Red, color.Green, color.Blue);
        var brush = new SolidColorBrush(wpfColor);
        ColorText.Text = color.ToHex();
        ColorPreview.Background = brush;
        ColorGlowBrush.Color = wpfColor;
        if (ColorPreview.Effect is DropShadowEffect glow)
        {
            glow.Color = wpfColor;
        }

        UpdateSwatchSelection(color.ToHex());
    }

    private void UpdateSwatchSelection(string? selectedHex = null)
    {
        selectedHex ??= _selectedDevice?.ColorHex;
        if (selectedHex is null)
        {
            return;
        }

        UpdateSwatchCollectionSelection(BuiltInSwatches, selectedHex);
        UpdateSwatchCollectionSelection(RecentCustomSwatches, selectedHex);
    }

    private static void UpdateSwatchCollectionSelection(IEnumerable<SwatchItem> swatches, string selectedHex)
    {
        foreach (var swatch in swatches)
        {
            swatch.IsSelected = string.Equals(swatch.Hex, selectedHex, StringComparison.OrdinalIgnoreCase);
        }
    }

    private void BrightnessSlider_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is not System.Windows.Controls.Slider slider || slider.ActualWidth <= 0)
        {
            return;
        }

        var clickRatio = Math.Clamp(e.GetPosition(slider).X / slider.ActualWidth, 0, 1);
        slider.Value = slider.Minimum + clickRatio * (slider.Maximum - slider.Minimum);
    }

    private void BrightnessSlider_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        ScheduleBrightnessApply();
    }

    private void BrightnessSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded || _suppressDevicePanelSync)
        {
            return;
        }

        UpdateBrightnessLabel();
        if (_selectedDevice is not null)
        {
            _selectedDevice.BrightnessPercent = (int)Math.Round(BrightnessSlider.Value);
        }

        ScheduleBrightnessApply();
    }

    private void ScheduleBrightnessApply()
    {
        if (_suppressDevicePanelSync || MainPanel.Visibility != Visibility.Visible || _selectedDevice is null)
        {
            return;
        }

        _brightnessApplyTimer.Stop();
        _brightnessApplyTimer.Start();
    }

    private async void BrightnessApplyTimer_Tick(object? sender, EventArgs e)
    {
        _brightnessApplyTimer.Stop();
        if (_selectedDevice is not null)
        {
            await ApplyDeviceAsync(_selectedDevice);
        }
    }

    private void UpdateBrightnessLabel()
    {
        BrightnessText.Text = $"{(int)Math.Round(BrightnessSlider.Value)}%";
    }

    private IProgress<string> CreateSetupProgress() =>
        new Progress<string>(message =>
        {
            SetupText.Text = message;
            StatusText.Text = message;
        });

    private void ShowSetup(string message)
    {
        SetupPanel.Visibility = Visibility.Visible;
        MainPanel.Visibility = Visibility.Collapsed;
        ApplyButton.IsEnabled = false;
        RefreshButton.IsEnabled = true;
        SetupText.Text = message;
        StatusText.Text = "Lighting support needs setup.";
        SetStatusIndicator(StatusKind.Setup);
    }

    private void ShowMain(string message)
    {
        SetupPanel.Visibility = Visibility.Collapsed;
        MainPanel.Visibility = Visibility.Visible;
        ApplyButton.IsEnabled = true;
        RefreshButton.IsEnabled = true;
        StatusText.Text = message;
        SetStatusIndicator(StatusKind.Ready);
    }

    private async Task RunBusyAsync(string message, Func<Task> action)
    {
        if (_busy)
        {
            return;
        }

        _busy = true;
        _brightnessApplyTimer.Stop();
        StatusText.Text = message;
        SetStatusIndicator(StatusKind.Busy);
        ApplyButton.IsEnabled = false;
        RefreshButton.IsEnabled = false;
        SetupButton.IsEnabled = false;

        try
        {
            await action();
        }
        finally
        {
            _busy = false;
            ApplyButton.IsEnabled = MainPanel.Visibility == Visibility.Visible;
            RefreshButton.IsEnabled = true;
            SetupButton.IsEnabled = true;
            SetStatusIndicator(MainPanel.Visibility == Visibility.Visible ? StatusKind.Ready : StatusKind.Setup);
        }
    }

    private enum StatusKind
    {
        Ready,
        Busy,
        Setup
    }

    private void SetStatusIndicator(StatusKind kind)
    {
        var color = kind switch
        {
            StatusKind.Ready => System.Windows.Media.Color.FromRgb(0x3D, 0xD6, 0x8C),
            StatusKind.Busy => System.Windows.Media.Color.FromRgb(0xF0, 0xA0, 0x30),
            _ => System.Windows.Media.Color.FromRgb(0xF0, 0x71, 0x78)
        };

        StatusDot.Fill = new SolidColorBrush(color);
    }
}

public sealed class DeviceItem : INotifyPropertyChanged
{
    private readonly RgbDevice _device;
    private readonly DeviceLightingSettings _settings;
    private System.Windows.Media.Brush _previewBrush;

    public DeviceItem(RgbDevice device, DeviceLightingSettings settings)
    {
        _device = device;
        _settings = settings;
        _previewBrush = CreateBrush(settings.Color);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Id => _device.Id;

    public string Name => string.IsNullOrWhiteSpace(_device.Vendor) ? _device.Name : $"{_device.Vendor} {_device.Name}";

    public string Details => _device.Zones.Count > 0
        ? $"{FormatLedCount(_device.LedCount)} · {string.Join(", ", _device.Zones.Select(zone => $"{zone.Name} ({zone.LedCount})"))} · {_device.Status}"
        : $"{FormatLedCount(_device.LedCount)} - {_device.Status}";

    public bool IsSupported => _device.IsSupported;

    public string ColorHex
    {
        get => _settings.Color;
        set
        {
            var normalized = RgbColor.FromHex(value).ToHex();
            if (string.Equals(_settings.Color, normalized, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            _settings.Color = normalized;
            PreviewBrush = CreateBrush(normalized);
            OnPropertyChanged(nameof(ColorHex));
            OnPropertyChanged(nameof(BrightnessLabel));
        }
    }

    public int BrightnessPercent
    {
        get => _settings.Brightness;
        set
        {
            var clamped = Math.Clamp(value, 1, 100);
            if (_settings.Brightness == clamped)
            {
                return;
            }

            _settings.Brightness = clamped;
            OnPropertyChanged(nameof(BrightnessPercent));
            OnPropertyChanged(nameof(BrightnessLabel));
        }
    }

    public string BrightnessLabel => $"{BrightnessPercent}%";

    public System.Windows.Media.Brush PreviewBrush
    {
        get => _previewBrush;
        private set
        {
            _previewBrush = value;
            OnPropertyChanged(nameof(PreviewBrush));
        }
    }

    public DeviceColorApply ToApplyRequest() =>
        new(Id, RgbColor.FromHex(ColorHex), BrightnessPercent);

    private static string FormatLedCount(int count) => count == 1 ? "1 LED" : $"{count} LEDs";

    private static System.Windows.Media.Brush CreateBrush(string hex)
    {
        var color = RgbColor.FromHex(hex);
        return new SolidColorBrush(System.Windows.Media.Color.FromRgb(color.Red, color.Green, color.Blue));
    }

    private void OnPropertyChanged(string propertyName) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}

public sealed class SwatchItem : INotifyPropertyChanged
{
    private bool _isSelected;

    public SwatchItem(string hex)
    {
        Hex = RgbColor.FromHex(hex).ToHex();
        Brush = CreateBrush(Hex);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Hex { get; }

    public System.Windows.Media.Brush Brush { get; }

    public bool IsSelected
    {
        get => _isSelected;
        set
        {
            if (_isSelected == value)
            {
                return;
            }

            _isSelected = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsSelected)));
        }
    }

    private static System.Windows.Media.Brush CreateBrush(string hex)
    {
        var color = RgbColor.FromHex(hex);
        return new SolidColorBrush(System.Windows.Media.Color.FromRgb(color.Red, color.Green, color.Blue));
    }
}
