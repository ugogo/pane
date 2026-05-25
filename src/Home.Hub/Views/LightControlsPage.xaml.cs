using Home.Core.Modules;
using Home.Hub.ViewModels;
using LightControls.Core;
using LightControls.Core.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;

namespace Home.Hub.Views;

public sealed partial class LightControlsPage : Page
{
    private readonly LightControlsPageViewModel _viewModel;
    private readonly DispatcherQueue _dispatcher;
    private readonly DispatcherQueueTimer _brightnessTimer;

    private LightControlsDevice? _selectedDevice;
    private bool _connectionBusy;
    private bool _suppressDeviceSync;

    public LightControlsPage()
    {
        InitializeComponent();
        _viewModel = App.Services.GetRequiredService<LightControlsPageViewModel>();
        _dispatcher = DispatcherQueue.GetForCurrentThread();
        _brightnessTimer = _dispatcher.CreateTimer();
        _brightnessTimer.Interval = TimeSpan.FromMilliseconds(250);
        _brightnessTimer.Tick += OnBrightnessTimerTick;
        Loaded += OnLoaded;
    }

    private LightControlsModule Module => _viewModel.Module;

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        BuildBuiltInSwatches();
        await LoadAdvancedSettingsAsync();
        UpdateConnectionStatus();
        if (Module.IsMainUiReady)
        {
            UpdatePresentation(Module.Status.Message);
            return;
        }

        await InitializeAsync();
    }

    private async Task LoadAdvancedSettingsAsync()
    {
        var settings = Module.IsEnabled
            ? Module.Settings
            : await Module.SettingsStore.LoadAsync();
        HostBox.Text = settings.Host;
        PortBox.Value = settings.Port;
        OpenRgbPathBox.Text = settings.OpenRgbExecutablePath ?? string.Empty;
        LogitechToggle.IsOn = settings.EnableLogitechDirect;
        DxLightToggle.IsOn = settings.EnableDxLightDirect;
    }

    private async Task InitializeAsync()
    {
        if (!Module.IsEnabled)
        {
            ShowSetup("Enable Light Controls on the Home page first.");
            UpdateConnectionStatus();
            return;
        }

        await RunConnectionAsync(async () =>
        {
            var message = await Module.InitializeUiAsync(CreateProgress());
            UpdatePresentation(message);
            UpdateConnectionStatus();
        });
    }

    private void BuildBuiltInSwatches()
    {
        PopulateSwatches(BuiltInSwatchesPanel, _viewModel.BuiltInSwatches);
        RefreshRecentSwatches();
    }

    private void RefreshRecentSwatches()
    {
        PopulateSwatches(RecentSwatchesPanel, _viewModel.RecentCustomSwatches);
        RecentEmptyText.Visibility = _viewModel.RecentCustomSwatches.Count == 0
            ? Visibility.Visible
            : Visibility.Collapsed;
    }

    private void PopulateSwatches(Panel panel, IEnumerable<string> swatches)
    {
        panel.Children.Clear();
        foreach (var hex in swatches)
        {
            var color = RgbColor.FromHex(hex);
            var button = new Button
            {
                Width = 36,
                Height = 32,
                Tag = hex,
                Background = new SolidColorBrush(
                    global::Windows.UI.Color.FromArgb(255, color.Red, color.Green, color.Blue)),
                BorderBrush = new SolidColorBrush(global::Windows.UI.Color.FromArgb(255, 255, 255, 255)),
                BorderThickness = new Thickness(1),
            };
            button.Click += OnSwatchClicked;
            panel.Children.Add(button);
        }
    }

    private async void OnSetupClicked(object sender, RoutedEventArgs e)
    {
        await RunConnectionAsync(async () =>
        {
            var message = await Module.RunSetupAsync(CreateProgress());
            UpdatePresentation(message);
            UpdateConnectionStatus();
        });
    }

    private void OnOpenReleasesClicked(object sender, RoutedEventArgs e) =>
        LightControlsModule.OpenOpenRgbReleases();

    private async void OnConnectClicked(object sender, RoutedEventArgs e) => await InitializeAsync();

    private async void OnSaveAdvancedSettingsClicked(object sender, RoutedEventArgs e)
    {
        var host = HostBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(host))
        {
            AdvancedSettingsStatusText.Text = "Enter an OpenRGB host.";
            return;
        }

        var port = (int)PortBox.Value;
        if (port is < 1 or > 65535)
        {
            AdvancedSettingsStatusText.Text = "Port must be between 1 and 65535.";
            return;
        }

        var settings = Module.Settings;
        settings.Host = host;
        settings.Port = port;
        settings.OpenRgbExecutablePath = string.IsNullOrWhiteSpace(OpenRgbPathBox.Text)
            ? null
            : OpenRgbPathBox.Text.Trim();
        settings.EnableLogitechDirect = LogitechToggle.IsOn;
        settings.EnableDxLightDirect = DxLightToggle.IsOn;

        await Module.SettingsStore.SaveAsync(settings);
        if (Module.IsEnabled)
        {
            await RunConnectionAsync(async () =>
            {
                await Module.ReloadAsync();
                var message = await Module.InitializeUiAsync(CreateProgress());
                UpdatePresentation(message);
            });
        }

        AdvancedSettingsStatusText.Text = "Settings saved.";
    }

    private async void OnRefreshClicked(object sender, RoutedEventArgs e)
    {
        await RunConnectionAsync(async () =>
        {
            await Module.RefreshDevicesAsync();
            UpdatePresentation(Module.Status.Message);
        });
    }

    private async void OnApplyAllClicked(object sender, RoutedEventArgs e)
    {
        string? result = null;
        await RunConnectionAsync(async () =>
        {
            result = await Module.ApplyAllSupportedAsync();
        });
        if (result is not null)
        {
            ConnectionStatusText.Text = result;
        }
    }

    private void OnDeviceSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (DevicesList.SelectedItem is LightControlsDevice device)
        {
            SelectDevice(device);
        }
    }

    private void SelectDevice(LightControlsDevice device)
    {
        _selectedDevice = device;
        _suppressDeviceSync = true;
        SelectedDeviceText.Text = device.Name;
        SetColorPreview(device.ColorHex);
        BrightnessSlider.Value = device.BrightnessPercent;
        BrightnessText.Text = $"{device.BrightnessPercent}%";
        ColorPickerButton.IsEnabled = device.IsSupported;
        BrightnessSlider.IsEnabled = device.IsSupported;
        DeviceControlsContent.Visibility = device.IsSupported
            ? Visibility.Visible
            : Visibility.Collapsed;
        _suppressDeviceSync = false;
    }

    private async void OnChooseColorClicked(object sender, RoutedEventArgs e)
    {
        if (_selectedDevice is null)
        {
            return;
        }

        var flyout = new Flyout();
        var picker = new ColorPicker
        {
            Color = ToWindowsColor(_selectedDevice.ColorHex),
            IsColorChannelTextInputVisible = false,
            IsColorPreviewVisible = true,
            IsColorSliderVisible = true,
        };
        picker.ColorChanged += async (_, args) =>
        {
            var hex = new RgbColor(args.NewColor.R, args.NewColor.G, args.NewColor.B).ToHex();
            await ApplyColorToSelectedAsync(hex, recordRecent: true);
        };
        flyout.Content = picker;
        flyout.ShowAt(ColorPickerButton);
    }

    private async void OnSwatchClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string hex })
        {
            await ApplyColorToSelectedAsync(hex, recordRecent: false);
        }
    }

    private async Task ApplyColorToSelectedAsync(string hex, bool recordRecent)
    {
        if (_selectedDevice is null || !Module.IsMainUiReady)
        {
            return;
        }

        _selectedDevice.ColorHex = hex;
        SetColorPreview(hex);
        if (recordRecent)
        {
            Module.RecordRecentCustomColor(hex);
            await Module.SettingsStore.SaveAsync(Module.Settings);
            RefreshRecentSwatches();
        }

        ApplySelectedDeviceInstant();
    }

    private void OnBrightnessChanged(object sender, RangeBaseValueChangedEventArgs e)
    {
        if (_suppressDeviceSync || _selectedDevice is null)
        {
            return;
        }

        var value = (int)Math.Round(e.NewValue);
        BrightnessText.Text = $"{value}%";
        _selectedDevice.BrightnessPercent = value;
        _brightnessTimer.Stop();
        _brightnessTimer.Start();
    }

    private void OnBrightnessTimerTick(DispatcherQueueTimer sender, object args)
    {
        sender.Stop();
        ApplySelectedDeviceInstant();
    }

    private void ApplySelectedDeviceInstant()
    {
        if (_selectedDevice is null || !Module.IsMainUiReady)
        {
            return;
        }

        var deviceId = _selectedDevice.Id;
        _ = ApplyDeviceSilentlyAsync(deviceId);
    }

    private async Task ApplyDeviceSilentlyAsync(string deviceId)
    {
        try
        {
            await Module.ApplyDeviceAsync(deviceId);
        }
        catch
        {
        }
    }

    private void UpdatePresentation(string message)
    {
        if (Module.IsMainUiReady)
        {
            SetupPanelHost.Visibility = Visibility.Collapsed;
            MainPanel.Visibility = Visibility.Visible;
            DevicesList.ItemsSource = Module.Devices.ToList();
            DevicesEmptyText.Visibility = Module.Devices.Count == 0
                ? Visibility.Visible
                : Visibility.Collapsed;
            DevicesList.Visibility = Module.Devices.Count == 0
                ? Visibility.Collapsed
                : Visibility.Visible;
            DeviceControlsContent.Visibility = Module.Devices.Count == 0
                ? Visibility.Collapsed
                : Visibility.Visible;

            SelectInitialDevice();
        }
        else
        {
            ShowSetup(message);
        }
    }

    private void SelectInitialDevice()
    {
        var previousId = _selectedDevice?.Id;
        var target = Module.Devices.FirstOrDefault(device => device.Id == previousId)
            ?? Module.Devices.FirstOrDefault(device => device.IsSupported)
            ?? Module.Devices.FirstOrDefault();

        if (target is not null)
        {
            DevicesList.SelectedItem = target;
            SelectDevice(target);
            return;
        }

        _selectedDevice = null;
        DevicesList.SelectedItem = null;
        SelectedDeviceText.Text = "No devices detected";
    }

    private void ShowSetup(string message)
    {
        SetupPanelHost.Visibility = Visibility.Visible;
        MainPanel.Visibility = Visibility.Collapsed;
        SetupText.Text = message;
    }

    private void UpdateConnectionStatus()
    {
        if (!Module.IsEnabled)
        {
            ConnectionStatusText.Text = "Disabled - enable Light Controls on Home.";
            ConnectButton.IsEnabled = false;
            return;
        }

        ConnectButton.IsEnabled = !_connectionBusy;
        ConnectionStatusText.Text = Module.IsMainUiReady
            ? $"Connected - {Module.Devices.Count} device(s)"
            : Module.Status.Message;
    }

    private async Task RunConnectionAsync(Func<Task> action)
    {
        if (_connectionBusy)
        {
            return;
        }

        _connectionBusy = true;
        ConnectionProgress.Visibility = Visibility.Visible;
        ConnectionProgress.IsActive = true;
        ConnectButton.IsEnabled = false;
        ConnectButtonText.Text = "Connecting...";
        SetupButton.IsEnabled = false;

        try
        {
            await action();
        }
        finally
        {
            _connectionBusy = false;
            ConnectionProgress.IsActive = false;
            ConnectionProgress.Visibility = Visibility.Collapsed;
            ConnectButtonText.Text = Module.IsMainUiReady ? "Reconnect" : "Connect";
            SetupButton.IsEnabled = true;
            UpdateConnectionStatus();
        }
    }

    private IProgress<string> CreateProgress() =>
        new Progress<string>(message =>
        {
            _dispatcher.TryEnqueue(() =>
            {
                SetupText.Text = message;
                ConnectionStatusText.Text = message;
            });
        });

    private void SetColorPreview(string hex)
    {
        var color = RgbColor.FromHex(hex);
        ColorPreview.Background = new SolidColorBrush(
            global::Windows.UI.Color.FromArgb(255, color.Red, color.Green, color.Blue));
        ColorText.Text = color.ToHex();
    }

    private static global::Windows.UI.Color ToWindowsColor(string hex)
    {
        var color = RgbColor.FromHex(hex);
        return global::Windows.UI.Color.FromArgb(255, color.Red, color.Green, color.Blue);
    }
}
