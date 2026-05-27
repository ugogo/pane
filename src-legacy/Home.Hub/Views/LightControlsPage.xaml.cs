using Home.Core.Modules;
using Home.Hub.ViewModels;
using LightControls.Core;
using LightControls.Core.Models;
using LightControls.Core.Settings;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace Home.Hub.Views;

public sealed partial class LightControlsPage : Page
{
    private const int SwatchColumns = 6;
    private const int MaxDisplayedRecentColors = 6;

    private readonly LightControlsPageViewModel _viewModel;
    private readonly DispatcherQueue _dispatcher;
    private readonly DispatcherQueueTimer _brightnessTimer;

    private LightControlsDevice? _selectedDevice;
    private bool _connectionBusy;
    private bool _suppressDeviceSync;
    private bool _suppressInlineColorSync;
    private bool _isInlineColorInteractionActive;
    private string? _pendingRecentColorHex;

    public LightControlsPage()
    {
        InitializeComponent();
        _viewModel = App.Services.GetRequiredService<LightControlsPageViewModel>();
        _dispatcher = DispatcherQueue.GetForCurrentThread();
        _brightnessTimer = _dispatcher.CreateTimer();
        _brightnessTimer.Interval = TimeSpan.FromMilliseconds(250);
        _brightnessTimer.Tick += OnBrightnessTimerTick;
        InlineColorPicker.AddHandler(PointerPressedEvent, new PointerEventHandler(OnInlineColorPointerPressed), true);
        InlineColorPicker.AddHandler(PointerReleasedEvent, new PointerEventHandler(OnInlineColorPointerReleased), true);
        InlineColorPicker.AddHandler(PointerCanceledEvent, new PointerEventHandler(OnInlineColorPointerEnded), true);
        InlineColorPicker.AddHandler(PointerCaptureLostEvent, new PointerEventHandler(OnInlineColorPointerEnded), true);
        Loaded += OnLoaded;
    }

    private LightControlsModule Module => _viewModel.Module;

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        RefreshRecentSwatches();
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

    private void RefreshRecentSwatches()
    {
        var favoriteSwatches = _viewModel.FavoriteSwatches
            .Select(NormalizeColorOrNull)
            .OfType<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var recentSwatches = _viewModel.RecentCustomSwatches
            .Select(NormalizeColorOrNull)
            .OfType<string>()
            .Where(color => !favoriteSwatches.Contains(color, StringComparer.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxDisplayedRecentColors)
            .ToList();

        PopulateSwatches(FavoriteColorsGrid, favoriteSwatches);
        PopulateSwatches(RecentColorsGrid, recentSwatches);
        FavoriteEmptyText.Visibility = favoriteSwatches.Count == 0
            ? Visibility.Visible
            : Visibility.Collapsed;
        RecentEmptyText.Visibility = recentSwatches.Count == 0
            ? Visibility.Visible
            : Visibility.Collapsed;
        RefreshFavoriteButtonState();
    }

    private void PopulateSwatches(Grid grid, IReadOnlyList<string> swatches)
    {
        grid.Children.Clear();
        grid.RowDefinitions.Clear();
        grid.ColumnDefinitions.Clear();
        for (var column = 0; column < SwatchColumns; column++)
        {
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
        }

        var rowCount = Math.Max(1, (int)Math.Ceiling(swatches.Count / (double)SwatchColumns));
        for (var row = 0; row < rowCount; row++)
        {
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(28) });
        }

        var selectedHex = _selectedDevice?.ColorHex;
        for (var index = 0; index < swatches.Count; index++)
        {
            var hex = swatches[index];
            var color = RgbColor.FromHex(hex);
            var button = new Button
            {
                Tag = hex,
                Background = new SolidColorBrush(
                    global::Windows.UI.Color.FromArgb(255, color.Red, color.Green, color.Blue)),
                Style = IsSameColor(hex, selectedHex)
                    ? (Style)Application.Current.Resources["ColorSwatchButtonSelectedStyle"]
                    : (Style)Application.Current.Resources["ColorSwatchButtonStyle"],
            };
            Grid.SetRow(button, index / SwatchColumns);
            Grid.SetColumn(button, index % SwatchColumns);
            AutomationProperties.SetName(button, $"Apply color {hex}");
            button.Click += OnSwatchClicked;
            grid.Children.Add(button);
        }
    }

    private static string? NormalizeColorOrNull(string hex)
    {
        try
        {
            return RgbColor.FromHex(hex).ToHex();
        }
        catch (ArgumentException)
        {
            return null;
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

        var settings = await LoadEditableSettingsAsync();
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

    private Task<LightControlsSettings> LoadEditableSettingsAsync() =>
        Module.IsEnabled
            ? Task.FromResult(Module.Settings)
            : Module.SettingsStore.LoadAsync();

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

    private void OnDeviceClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: LightControlsDevice device })
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
        SyncInlineColorPicker(device.ColorHex);
        BrightnessSlider.Value = device.BrightnessPercent;
        BrightnessText.Text = $"{device.BrightnessPercent}%";
        ColorPickerButton.IsEnabled = device.IsSupported;
        AddFavoriteButton.IsEnabled = device.IsSupported;
        BrightnessSlider.IsEnabled = device.IsSupported;
        DeviceControlsContent.Visibility = device.IsSupported
            ? Visibility.Visible
            : Visibility.Collapsed;
        _suppressDeviceSync = false;
        RefreshDeviceSelectionVisuals();
        RefreshRecentSwatches();
    }

    private async void OnAddFavoriteClicked(object sender, RoutedEventArgs e)
    {
        if (_selectedDevice is null)
        {
            return;
        }

        Module.AddFavoriteColor(_selectedDevice.ColorHex);
        await Module.SettingsStore.SaveAsync(Module.Settings);
        RefreshRecentSwatches();
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
        string? pendingHex = null;
        picker.ColorChanged += async (_, args) =>
        {
            var hex = new RgbColor(args.NewColor.R, args.NewColor.G, args.NewColor.B).ToHex();
            pendingHex = hex;
            await ApplyColorToSelectedAsync(hex, recordRecent: false);
        };
        flyout.Closed += async (_, _) =>
        {
            if (pendingHex is not null)
            {
                await ApplyColorToSelectedAsync(pendingHex, recordRecent: true);
            }
        };
        flyout.Content = picker;
        flyout.ShowAt(ColorPickerButton);
    }

    private async void OnSwatchClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string hex })
        {
            await ApplyColorToSelectedAsync(hex, recordRecent: true);
        }
    }

    private async void OnInlineColorChanged(ColorPicker sender, ColorChangedEventArgs args)
    {
        if (_suppressInlineColorSync || _selectedDevice is null)
        {
            return;
        }

        var hex = new RgbColor(args.NewColor.R, args.NewColor.G, args.NewColor.B).ToHex();
        _pendingRecentColorHex = hex;
        await ApplyColorToSelectedAsync(hex, recordRecent: !_isInlineColorInteractionActive);
    }

    private void OnInlineColorPointerPressed(object sender, PointerRoutedEventArgs e)
    {
        _isInlineColorInteractionActive = true;
        _pendingRecentColorHex = null;
    }

    private async void OnInlineColorPointerReleased(object sender, PointerRoutedEventArgs e) =>
        await CommitPendingInlineColorAsync();

    private async void OnInlineColorPointerEnded(object sender, PointerRoutedEventArgs e) =>
        await CommitPendingInlineColorAsync();

    private async Task CommitPendingInlineColorAsync()
    {
        if (!_isInlineColorInteractionActive)
        {
            return;
        }

        _isInlineColorInteractionActive = false;
        if (_pendingRecentColorHex is null)
        {
            return;
        }

        var hex = _pendingRecentColorHex;
        _pendingRecentColorHex = null;
        await ApplyColorToSelectedAsync(hex, recordRecent: true);
    }

    private async Task ApplyColorToSelectedAsync(string hex, bool recordRecent)
    {
        if (_selectedDevice is null || !Module.IsMainUiReady)
        {
            return;
        }

        _selectedDevice.ColorHex = hex;
        SetColorPreview(hex);
        SyncInlineColorPicker(hex);
        if (recordRecent)
        {
            Module.RecordRecentCustomColor(hex);
            await Module.SettingsStore.SaveAsync(Module.Settings);
        }

        ApplySelectedDeviceInstant();
        RefreshRecentSwatches();
    }

    private void RefreshFavoriteButtonState()
    {
        if (_selectedDevice is null)
        {
            AddFavoriteButton.IsEnabled = false;
            AddFavoriteText.Text = "Add to favorite";
            return;
        }

        var isFavorite = _viewModel.FavoriteSwatches
            .Select(NormalizeColorOrNull)
            .OfType<string>()
            .Any(color => IsSameColor(color, _selectedDevice.ColorHex));
        AddFavoriteButton.IsEnabled = _selectedDevice.IsSupported && !isFavorite;
        AddFavoriteText.Text = isFavorite ? "Favorite" : "Add to favorite";
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
            SelectDevice(target);
            return;
        }

        _selectedDevice = null;
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

    private void RefreshDeviceSelectionVisuals()
    {
        var selectedId = _selectedDevice?.Id;
        foreach (var item in DevicesList.Items)
        {
            if (DevicesList.ContainerFromItem(item) is not ContentPresenter presenter)
            {
                continue;
            }

            var rowButton = FindDescendant<Button>(presenter);
            if (rowButton is null)
            {
                continue;
            }

            var isSelected = item is LightControlsDevice device
                && string.Equals(device.Id, selectedId, StringComparison.OrdinalIgnoreCase);
            rowButton.Style = (Style)Application.Current.Resources[
                isSelected ? "DeviceRowButtonSelectedStyle" : "DeviceRowButtonStyle"];
        }
    }

    private void SyncInlineColorPicker(string hex)
    {
        var color = ToWindowsColor(hex);
        if (InlineColorPicker.Color == color)
        {
            return;
        }

        _suppressInlineColorSync = true;
        InlineColorPicker.Color = color;
        _suppressInlineColorSync = false;
    }

    private static global::Windows.UI.Color ToWindowsColor(string hex)
    {
        var color = RgbColor.FromHex(hex);
        return global::Windows.UI.Color.FromArgb(255, color.Red, color.Green, color.Blue);
    }

    private static bool IsSameColor(string? left, string? right) =>
        !string.IsNullOrWhiteSpace(left)
        && !string.IsNullOrWhiteSpace(right)
        && string.Equals(
            RgbColor.FromHex(left).ToHex(),
            RgbColor.FromHex(right).ToHex(),
            StringComparison.OrdinalIgnoreCase);

    private static T? FindDescendant<T>(DependencyObject root)
        where T : DependencyObject
    {
        var childCount = VisualTreeHelper.GetChildrenCount(root);
        for (var i = 0; i < childCount; i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            if (child is T match)
            {
                return match;
            }

            var descendant = FindDescendant<T>(child);
            if (descendant is not null)
            {
                return descendant;
            }
        }

        return null;
    }
}
