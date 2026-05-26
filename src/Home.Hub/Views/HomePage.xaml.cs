using Home.Hub.ViewModels;
using LightControls.Core;
using LightControls.Core.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace Home.Hub.Views;

public sealed partial class HomePage : Page
{
    private readonly HomePageViewModel _viewModel;
    private readonly DispatcherQueue _dispatcher;
    private readonly DispatcherQueueTimer _brightnessTimer;
    private bool _suppressMasterToggle;
    private bool _suppressBrightness;

    public HomePage()
    {
        InitializeComponent();
        _viewModel = App.Services.GetRequiredService<HomePageViewModel>();
        DataContext = _viewModel;
        _dispatcher = DispatcherQueue.GetForCurrentThread();
        _brightnessTimer = _dispatcher.CreateTimer();
        _brightnessTimer.Interval = TimeSpan.FromMilliseconds(300);
        _brightnessTimer.Tick += OnBrightnessTimerTick;
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        BrightnessSlider.Minimum = 1;
        BrightnessSlider.Maximum = 100;
        RefreshPresentation();
    }

    protected override void OnNavigatedTo(Microsoft.UI.Xaml.Navigation.NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        RefreshPresentation();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e) => _brightnessTimer.Stop();

    private void RefreshPresentation()
    {
        _viewModel.Refresh();
        UpdateNoDevicesVisibility();
        UpdateStatusDot();
        UpdateSceneCardBackground();
        SyncMasterSwitch();
        SyncBrightnessSlider();
    }

    private void UpdateNoDevicesVisibility() =>
        NoDevicesText.Visibility = _viewModel.ConnectedDevices.Count == 0
            ? Visibility.Visible
            : Visibility.Collapsed;

    private void UpdateStatusDot()
    {
        var color = _viewModel.SystemStatusIsHealthy
            ? Color.FromArgb(255, 95, 211, 90)
            : _viewModel.SystemStatusIsWarning
                ? Color.FromArgb(255, 232, 184, 74)
                : Color.FromArgb(255, 107, 114, 128);
        StatusDot.Fill = new SolidColorBrush(color);
    }

    private void UpdateSceneCardBackground()
    {
        var sceneColor = RgbColor.FromHex(_viewModel.ActiveSceneColorHex);
        SceneCardHost.Background = new LinearGradientBrush
        {
            StartPoint = new global::Windows.Foundation.Point(0, 0),
            EndPoint = new global::Windows.Foundation.Point(1, 1),
            GradientStops =
            {
                new GradientStop { Color = Color.FromArgb(90, sceneColor.Red, sceneColor.Green, sceneColor.Blue), Offset = 0 },
                new GradientStop { Color = Color.FromArgb(40, 139, 124, 255), Offset = 0.55 },
                new GradientStop { Color = Color.FromArgb(24, 24, 24, 32), Offset = 1 },
            },
        };
    }

    private void SyncMasterSwitch()
    {
        _suppressMasterToggle = true;
        MasterSwitch.IsOn = _viewModel.MasterSwitchOn;
        MasterSwitch.IsEnabled = _viewModel.IsMasterSwitchEnabled;
        _suppressMasterToggle = false;
    }

    private void SyncBrightnessSlider()
    {
        _suppressBrightness = true;
        BrightnessSlider.Value = Math.Clamp(_viewModel.GlobalBrightness, 1, 100);
        _suppressBrightness = false;
    }

    private async void OnMasterSwitchToggled(object sender, bool isOn)
    {
        if (_suppressMasterToggle || !_viewModel.IsMasterSwitchEnabled)
        {
            return;
        }

        await _viewModel.SetMasterSwitchAsync(isOn);
        RefreshPresentation();
    }

    private void OnBrightnessChanged(object sender, RangeBaseValueChangedEventArgs e)
    {
        if (_suppressBrightness)
        {
            return;
        }

        _brightnessTimer.Stop();
        _brightnessTimer.Start();
    }

    private async void OnBrightnessTimerTick(DispatcherQueueTimer sender, object args)
    {
        sender.Stop();
        if (!_viewModel.IsMasterSwitchEnabled)
        {
            return;
        }

        await _viewModel.SetGlobalBrightnessAsync((int)BrightnessSlider.Value);
        RefreshPresentation();
    }

    private async void OnEditSceneClicked(object sender, RoutedEventArgs e)
    {
        if (_viewModel.ActiveScene is null)
        {
            return;
        }

        var scene = _viewModel.ActiveScene;
        var color = RgbColor.FromHex(scene.ColorHex);
        var picker = new ColorPicker
        {
            Color = Color.FromArgb(255, color.Red, color.Green, color.Blue),
            IsColorChannelTextInputVisible = true,
            IsColorSpectrumVisible = true,
            IsHexInputVisible = true,
        };

        var brightnessBox = new NumberBox
        {
            Header = "Brightness",
            Minimum = 1,
            Maximum = 100,
            Value = scene.Brightness,
            SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline,
        };

        var panel = new StackPanel { Spacing = 12, MinWidth = 320 };
        panel.Children.Add(picker);
        panel.Children.Add(brightnessBox);

        var dialog = new ContentDialog
        {
            Title = $"Edit {scene.Name}",
            Content = panel,
            PrimaryButtonText = "Apply",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = XamlRoot,
        };

        if (await dialog.ShowAsync() != ContentDialogResult.Primary)
        {
            return;
        }

        var selected = picker.Color;
        var hex = $"#{selected.R:X2}{selected.G:X2}{selected.B:X2}";
        await _viewModel.UpdateActiveSceneAsync(hex, (int)brightnessBox.Value);
        RefreshPresentation();
    }

    private void OnModuleOpenClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string moduleId })
        {
            App.MainWindow.NavigateToTag(moduleId);
        }
    }
}
