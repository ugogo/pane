using DXLight.Core;
using Home.Core.Modules;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace Home.Hub.Views;

public sealed partial class DxLightSettingsPage : Page
{
    private bool _updatingUi;

    public DxLightSettingsPage()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private LightController Controller =>
        App.Services.GetRequiredService<DxLightModule>().Controller;

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        Controller.PropertyChanged += OnControllerPropertyChanged;
        UpdateUi();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        Controller.PropertyChanged -= OnControllerPropertyChanged;
    }

    private void OnControllerPropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e) =>
        UpdateUi();

    private void UpdateUi()
    {
        _updatingUi = true;
        try
        {
            var connected = Controller.Status.State == ConnectionState.Connected;
            StatusLabel.Text = Controller.Status.State switch
            {
                ConnectionState.Searching => "Searching for strip…",
                ConnectionState.Connected => $"Connected — {Controller.Status.Device?.Kind.ToString().ToLowerInvariant()}",
                ConnectionState.Error => Controller.Status.Message ?? "Not connected",
                _ => string.Empty,
            };

            PowerToggle.IsEnabled = connected;
            PowerToggle.IsOn = Controller.IsOn;
            PowerToggle.Header = Controller.IsOn ? "Light is on" : "Light is off";

            BrightnessSlider.IsEnabled = connected && Controller.IsOn;
            var brightnessValue = Math.Clamp((int)Math.Round(Controller.Brightness * 100), 0, 100);
            BrightnessSlider.Value = brightnessValue;

            BrightnessLabel.Text = $"{brightnessValue}%";
            CustomColorButton.IsEnabled = connected && Controller.IsOn;
            SmoothToggle.IsOn = Controller.SmoothTransitions;
            UsbToggle.IsOn = Controller.TurnOnWhenUsbConnects;
            RebuildPresetButtons();
        }
        finally
        {
            _updatingUi = false;
        }
    }

    private void RebuildPresetButtons()
    {
        PresetPanel.Children.Clear();
        foreach (var preset in Controller.ColorPresets)
        {
            var color = preset.Color;
            var button = new Button
            {
                Width = 36,
                Height = 32,
                Tag = preset,
                Content = preset.Name == ColorPreset.SavedName ? new TextBlock { Text = "*", Foreground = new SolidColorBrush(global::Windows.UI.Color.FromArgb(255, 255, 255, 255)) } : null,
                Background = new SolidColorBrush(global::Windows.UI.Color.FromArgb(255, color.Red, color.Green, color.Blue)),
                BorderThickness = new Thickness(preset.Color == Controller.Color ? 2 : 1),
                BorderBrush = new SolidColorBrush(global::Windows.UI.Color.FromArgb(255, 255, 255, 255)),
                IsEnabled = Controller.Status.State == ConnectionState.Connected && Controller.IsOn,
            };
            button.Click += OnPresetClicked;
            PresetPanel.Children.Add(button);
        }
    }

    private async void OnPowerToggled(object sender, RoutedEventArgs e)
    {
        if (_updatingUi)
        {
            return;
        }

        await Controller.SetPowerAsync(PowerToggle.IsOn);
    }

    private void OnBrightnessChanged(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        if (_updatingUi)
        {
            return;
        }

        BrightnessLabel.Text = $"{(int)Math.Round(e.NewValue)}%";
        Controller.SetBrightness(e.NewValue / 100.0);
    }

    private void OnPresetClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: ColorPreset preset })
        {
            Controller.SetColor(preset.Color);
        }
    }

    private void OnChooseColorClicked(object sender, RoutedEventArgs e)
    {
        var flyout = new Flyout();
        var picker = new ColorPicker
        {
            Color = ToWindowsColor(Controller.Color),
            IsColorChannelTextInputVisible = false,
            IsColorPreviewVisible = true,
            IsColorSliderVisible = true,
        };
        picker.ColorChanged += (_, args) =>
        {
            var c = args.NewColor;
            Controller.SetColor(new RgbColor(c.R, c.G, c.B));
        };
        flyout.Content = picker;
        flyout.ShowAt(CustomColorButton);
    }

    private void OnSavePresetClicked(object sender, RoutedEventArgs e) => Controller.SaveColorAsPreset();

    private void OnSmoothToggled(object sender, RoutedEventArgs e)
    {
        if (!_updatingUi)
        {
            Controller.SetSmoothTransitions(SmoothToggle.IsOn);
        }
    }

    private void OnUsbToggled(object sender, RoutedEventArgs e)
    {
        if (!_updatingUi)
        {
            Controller.SetTurnOnWhenUsbConnects(UsbToggle.IsOn);
        }
    }

    private async void OnRefreshClicked(object sender, RoutedEventArgs e) =>
        await Controller.RefreshConnectionAsync();

    private static global::Windows.UI.Color ToWindowsColor(RgbColor color) =>
        global::Windows.UI.Color.FromArgb(255, color.Red, color.Green, color.Blue);
}
