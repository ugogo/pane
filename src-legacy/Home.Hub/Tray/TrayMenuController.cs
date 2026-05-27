using CleanShot.Core.Services;
using H.NotifyIcon;
using Home.Core;
using Home.Hub.Modules;
using Home.Hub.Navigation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;

namespace Home.Hub.Tray;

internal sealed class TrayMenuController
{
    private readonly DispatcherQueue _dispatcher;
    private readonly TaskbarIcon _trayIcon;
    private readonly Action _showHome;
    private readonly Action _quit;

    private XamlUICommand? _captureScreenCommand;
    private XamlUICommand? _captureAreaCommand;

    public TrayMenuController(
        TaskbarIcon trayIcon,
        DispatcherQueue dispatcher,
        Action showHome,
        Action quit)
    {
        _trayIcon = trayIcon;
        _dispatcher = dispatcher;
        _showHome = showHome;
        _quit = quit;
        BuildMenu();
    }

    public void Refresh() => BuildMenu();

    private void BuildMenu()
    {
        var menu = new MenuFlyout();
        var cleanShot = TryGetCleanShotModule();

        if (cleanShot?.IsEnabled == true && cleanShot.Coordinator is not null)
        {
            _captureScreenCommand = CreateCommand(
                FormatCaptureLabel("Capture Screen", HotkeyConfiguration.FullScreenDisplay),
                () => RunOnUiThread(cleanShot.Coordinator.BeginFullScreenCapture));
            menu.Items.Add(new MenuFlyoutItem { Command = _captureScreenCommand });

            _captureAreaCommand = CreateCommand(
                FormatCaptureLabel("Capture Area", HotkeyConfiguration.RegionDisplay),
                () => RunOnUiThread(cleanShot.Coordinator.BeginRegionCapture));
            menu.Items.Add(new MenuFlyoutItem { Command = _captureAreaCommand });

            menu.Items.Add(new MenuFlyoutSeparator());
        }

        menu.Items.Add(new MenuFlyoutItem
        {
            Command = CreateCommand("Open Home", _showHome),
        });

        if (ModuleNavigation.HasSettingsPage(HomeServiceCollectionExtensions.CleanShotModuleId))
        {
            menu.Items.Add(new MenuFlyoutItem
            {
                Command = CreateCommand("CleanShot settings", () =>
                    RunOnUiThread(() => App.MainWindow.NavigateToTag(HomeServiceCollectionExtensions.CleanShotModuleId))),
            });
        }

        if (ModuleNavigation.HasSettingsPage(HomeServiceCollectionExtensions.LightControlsModuleId))
        {
            menu.Items.Add(new MenuFlyoutItem
            {
                Command = CreateCommand("Light Controls", () =>
                    RunOnUiThread(() => App.MainWindow.NavigateToTag(HomeServiceCollectionExtensions.LightControlsModuleId))),
            });
        }

        if (cleanShot?.IsEnabled == true)
        {
            menu.Items.Add(new MenuFlyoutItem
            {
                Command = CreateCommand("Open save folder", () => RunOnUiThread(OpenSaveFolder)),
            });
        }

        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(new MenuFlyoutItem
        {
            Command = CreateCommand("Quit Home", _quit),
        });

        _trayIcon.ContextFlyout = menu;
        UpdateCaptureLabels();
    }

    private void UpdateCaptureLabels()
    {
        if (_captureScreenCommand is not null)
        {
            _captureScreenCommand.Label = FormatCaptureLabel(
                "Capture Screen",
                HotkeyConfiguration.FullScreenDisplay);
        }

        if (_captureAreaCommand is not null)
        {
            _captureAreaCommand.Label = FormatCaptureLabel(
                "Capture Area",
                HotkeyConfiguration.RegionDisplay);
        }
    }

    private static string FormatCaptureLabel(string label, string shortcut) => $"{label}  ·  {shortcut}";

    private static void OpenSaveFolder()
    {
        var folder = SaveService.GetSaveFolder();
        Directory.CreateDirectory(folder);
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = folder,
            UseShellExecute = true,
        });
    }

    private static XamlUICommand CreateCommand(string label, Action action)
    {
        var command = new XamlUICommand { Label = label };
        command.ExecuteRequested += (_, _) => action();
        return command;
    }

    private void RunOnUiThread(Action action)
    {
        if (_dispatcher.HasThreadAccess)
        {
            action();
            return;
        }

        _dispatcher.TryEnqueue(() => action());
    }

    private static CleanShotModule? TryGetCleanShotModule()
    {
        try
        {
            return App.Services.GetService<CleanShotModule>();
        }
        catch
        {
            return null;
        }
    }
}
