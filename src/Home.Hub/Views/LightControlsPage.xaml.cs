using Home.Core.Modules;
using Home.Hub.ViewModels;
using LightControls.Core;
using LightControls.Core.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Home.Hub.Views;

public sealed partial class LightControlsPage : Page
{
    private readonly LightControlsPageViewModel _viewModel;
    private readonly DispatcherQueue _dispatcher;
    private readonly DispatcherQueueTimer _brightnessTimer;

    private LightControlsDevice? _selectedDevice;
    private bool _busy;
    private bool _suppressDeviceSync;

    public LightControlsPage()
    {
        InitializeComponent();
        _viewModel = App.Services.GetRequiredService<LightControlsPageViewModel>();
        _dispatcher = DispatcherQueue.GetForCurrentThread();
        _brightnessTimer = _dispatcher.CreateTimer();
        _brightnessTimer.Interval = TimeSpan.FromMilliseconds(300);
        _brightnessTimer.Tick += OnBrightnessTimerTick;
        Loaded += OnLoaded;
    }

    private LightControlsModule Module => _viewModel.Module;

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        ConnectionFrame.Navigate(typeof(LightControlsSettingsPage));
        BuildBuiltInSwatches();
        await InitializeAsync();
    }

    private async Task InitializeAsync()
    {
        if (!Module.IsEnabled)
        {
            ShowSetup("Enable Light Controls on the Home page first.");
            return;
        }

        await RunBusyAsync("Checking lighting support...", async () =>
        {
            var message = await Module.InitializeUiAsync(CreateProgress());
            UpdatePresentation(message);
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
        await RunBusyAsync("Setting up lighting support...", async () =>
        {
            var message = await Module.RunSetupAsync(CreateProgress());
            UpdatePresentation(message);
        });
    }

    private async void OnRetryClicked(object sender, RoutedEventArgs e) => await InitializeAsync();

    private void OnOpenReleasesClicked(object sender, RoutedEventArgs e) =>
        LightControlsModule.OpenOpenRgbReleases();

    private async void OnRefreshClicked(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync("Refreshing devices...", async () =>
        {
            await Module.RefreshDevicesAsync();
            UpdatePresentation(Module.Status.Message);
        });
    }

    private async void OnApplyAllClicked(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync("Applying colors...", async () =>
        {
            StatusText.Text = await Module.ApplyAllSupportedAsync();
        });
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

        await RunBusyAsync($"Applying to {_selectedDevice.Name}...", async () =>
        {
            StatusText.Text = await Module.ApplyDeviceAsync(_selectedDevice.Id);
        });
    }

    private void OnBrightnessChanged(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
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

    private async void OnBrightnessTimerTick(DispatcherQueueTimer sender, object args)
    {
        sender.Stop();
        if (_selectedDevice is null || !Module.IsMainUiReady)
        {
            return;
        }

        var device = _selectedDevice;
        await RunBusyAsync($"Applying to {device.Name}...", async () =>
        {
            StatusText.Text = await Module.ApplyDeviceAsync(device.Id);
        });
    }

    private void UpdatePresentation(string message)
    {
        if (Module.IsMainUiReady)
        {
            SetupPanel.Visibility = Visibility.Collapsed;
            MainPanel.Visibility = Visibility.Visible;
            StatusText.Text = Module.Devices.Count == 0
                ? "No compatible devices were reported."
                : $"{Module.Devices.Count} device(s) detected.";
            DevicesList.ItemsSource = Module.Devices.ToList();
            DevicesEmptyText.Visibility = Module.Devices.Count == 0
                ? Visibility.Visible
                : Visibility.Collapsed;
            DevicesList.Visibility = Module.Devices.Count == 0
                ? Visibility.Collapsed
                : Visibility.Visible;

            var initial = Module.Devices.FirstOrDefault(device => device.IsSupported)
                ?? Module.Devices.FirstOrDefault();
            if (initial is not null)
            {
                DevicesList.SelectedItem = initial;
                SelectDevice(initial);
            }
        }
        else
        {
            ShowSetup(message);
        }
    }

    private void ShowSetup(string message)
    {
        SetupPanel.Visibility = Visibility.Visible;
        MainPanel.Visibility = Visibility.Collapsed;
        SetupText.Text = message;
        StatusText.Text = "Lighting support needs setup.";
    }

    private async Task RunBusyAsync(string message, Func<Task> action)
    {
        if (_busy)
        {
            return;
        }

        _busy = true;
        _brightnessTimer.Stop();
        StatusText.Text = message;
        SetupButton.IsEnabled = false;

        try
        {
            await action();
        }
        finally
        {
            _busy = false;
            SetupButton.IsEnabled = true;
        }
    }

    private IProgress<string> CreateProgress() =>
        new Progress<string>(message =>
        {
            _dispatcher.TryEnqueue(() =>
            {
                SetupText.Text = message;
                StatusText.Text = message;
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
