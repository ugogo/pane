using CleanShotW.Services;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Windows.Storage.Pickers;
using WinRT.Interop;
using WinUIEx;

namespace CleanShotW.Views;

public sealed partial class SettingsWindow : WindowEx
{
    private static SettingsWindow? _instance;

    private readonly CaptureCoordinator _coordinator;

    public SettingsWindow(CaptureCoordinator coordinator)
    {
        _coordinator = coordinator;
        InitializeComponent();
        ConfigureWindow();
        LoadFields();
    }

    public static void ShowOrActivate(CaptureCoordinator coordinator)
    {
        if (_instance is not null)
        {
            _instance.Activate();
            return;
        }

        _instance = new SettingsWindow(coordinator);
        _instance.Closed += (_, _) => _instance = null;
        _instance.Activate();
    }

    private void ConfigureWindow()
    {
        Title = "CleanShot W · Settings";
        Width = 420;
        Height = 580;
        IsShownInSwitchers = true;
        IsMinimizable = true;
        IsMaximizable = false;
        IsResizable = false;

        var presenter = AppWindow.Presenter as OverlappedPresenter;
        presenter?.SetBorderAndTitleBar(true, true);
    }

    private void LoadFields()
    {
        SaveFolderBox.Text = SaveService.GetSaveFolder();
        FullScreenShortcutBox.SetHotkey(
            HotkeyConfiguration.FullScreenModifiers,
            HotkeyConfiguration.FullScreenKey);
        RegionShortcutBox.SetHotkey(
            HotkeyConfiguration.RegionModifiers,
            HotkeyConfiguration.RegionKey);
        LaunchAtStartupToggle.IsOn = AppSettingsService.LaunchAtStartup;
    }

    private async void OnBrowseFolderClicked(object sender, RoutedEventArgs e)
    {
        var picker = new FolderPicker();
        picker.FileTypeFilter.Add("*");

        var hwnd = WindowNative.GetWindowHandle(this);
        InitializeWithWindow.Initialize(picker, hwnd);

        var folder = await picker.PickSingleFolderAsync();
        if (folder is not null)
        {
            SaveFolderBox.Text = folder.Path;
        }
    }

    private void OnSaveClicked(object sender, RoutedEventArgs e)
    {
        SaveSettings();
    }

    private void OnShortcutEnterPressed(object sender, EventArgs e)
    {
        SaveSettings();
    }

    private void SaveSettings()
    {
        var saveFolder = SaveFolderBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(saveFolder))
        {
            SetStatus("Choose a save folder.");
            return;
        }

        try
        {
            _ = Path.GetFullPath(saveFolder);
        }
        catch (Exception)
        {
            SetStatus("Save folder path is not valid.");
            return;
        }

        if (!FullScreenShortcutBox.TryGetHotkey(out var fullScreenModifiers, out var fullScreenKey, out var error))
        {
            SetStatus($"Full screen: {error}");
            return;
        }

        if (!RegionShortcutBox.TryGetHotkey(out var regionModifiers, out var regionKey, out error))
        {
            SetStatus($"Region: {error}");
            return;
        }

        SaveService.SetSaveFolder(saveFolder);
        AppSettingsService.SetSaveFolder(saveFolder);
        AppSettingsService.SetLaunchAtStartup(LaunchAtStartupToggle.IsOn);
        StartupService.Apply(AppSettingsService.LaunchAtStartup);

        try
        {
            Directory.CreateDirectory(saveFolder);
        }
        catch (Exception ex)
        {
            SetStatus($"Could not create save folder: {ex.Message}");
            return;
        }

        if (!_coordinator.TryApplyHotkeys(
            HotkeyParser.Format(fullScreenModifiers, fullScreenKey),
            HotkeyParser.Format(regionModifiers, regionKey),
            out error))
        {
            SetStatus(error);
            return;
        }

        AppSettingsService.SaveSettings();
        LoadFields();
        SetStatus("Settings saved.");
    }

    private void SetStatus(string message)
    {
        StatusText.Text = message;
    }
}
