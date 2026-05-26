using CleanShot.Core.Services;
using Home.Hub.Modules;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace Home.Hub.Views;

public sealed partial class CleanShotSettingsPage : Page
{
    public CleanShotSettingsPage()
    {
        InitializeComponent();
        Loaded += (_, _) => LoadFields();
    }

    private CleanShotModule Module => App.Services.GetRequiredService<CleanShotModule>();

    private void LoadFields()
    {
        SaveFolderBox.Text = SaveService.GetSaveFolder();
        FullScreenShortcutBox.SetHotkey(
            HotkeyConfiguration.FullScreenModifiers,
            HotkeyConfiguration.FullScreenKey);
        RegionShortcutBox.SetHotkey(
            HotkeyConfiguration.RegionModifiers,
            HotkeyConfiguration.RegionKey);
    }

    private async void OnBrowseFolderClicked(object sender, RoutedEventArgs e)
    {
        var picker = new FolderPicker();
        picker.FileTypeFilter.Add("*");

        var hwnd = WindowNative.GetWindowHandle(App.MainWindow);
        InitializeWithWindow.Initialize(picker, hwnd);

        var folder = await picker.PickSingleFolderAsync();
        if (folder is not null)
        {
            SaveFolderBox.Text = folder.Path;
        }
    }

    private void OnSaveClicked(object sender, RoutedEventArgs e) => SaveSettings();

    private void OnShortcutEnterPressed(object sender, EventArgs e) => SaveSettings();

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

        try
        {
            Directory.CreateDirectory(saveFolder);
        }
        catch (Exception ex)
        {
            SetStatus($"Could not create save folder: {ex.Message}");
            return;
        }

        if (!Module.TryApplyHotkeys(
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
        App.MainViewModel.RefreshHotkeyConflicts();
        TryRefreshTrayMenu();
    }

    private static void TryRefreshTrayMenu()
    {
        try
        {
            App.MainWindow.RefreshTrayMenu();
        }
        catch (InvalidOperationException)
        {
        }
    }

    private void SetStatus(string message) => StatusText.Text = message;
}
