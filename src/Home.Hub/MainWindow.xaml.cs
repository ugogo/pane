using System.Runtime.InteropServices;
using H.NotifyIcon;
using Home.Core;
using Home.Hub.Controls;
using Home.Hub.Modules;
using Home.Windows;
using Home.Hub.Navigation;
using Home.Hub.Tray;
using Home.Hub.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Windowing;
using WinRT.Interop;
using WinUIEx;
using Windows.Graphics;

namespace Home.Hub;

public sealed partial class MainWindow : WindowEx
{
    private const int GwlpWndproc = -4;

    private bool _trayInitialized;
    private bool _forceClose;
    private bool _isRestoringModules;
    private IntPtr _originalWndProc;
    private WndProcDelegate? _wndProcDelegate;
    private TrayMenuController? _trayMenu;
    private string _initialNavigationTag = "home";

    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
    private static extern IntPtr SetWindowLong32(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll")]
    private static extern IntPtr CallWindowProc(IntPtr lpPrevWndFunc, IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    public MainWindow()
    {
        InitializeComponent();
        Title = "Home";
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        SystemBackdrop = new Microsoft.UI.Xaml.Media.MicaBackdrop();
        AppWindow.Resize(new SizeInt32(1000, 930));
        IsResizable = false;

        BuildModuleNavigation();

        if (App.StandaloneModuleId is not null)
        {
            ApplyStandaloneNavigation(App.StandaloneModuleId);
            Title = GetStandaloneTitle(App.StandaloneModuleId);
        }

        var settings = HubSettingsStore.Load();
        _initialNavigationTag = App.StandaloneModuleId ?? settings.LastOpenedPage;

        AppWindow.Closing += OnAppWindowClosing;
        AppWindow.Changed += OnAppWindowChanged;
        AppTitleBar.SizeChanged += (_, _) => ApplyTitleBarInsets();
    }

    private void OnAppWindowChanged(AppWindow sender, AppWindowChangedEventArgs args)
    {
        if (args.DidSizeChange || args.DidPresenterChange)
        {
            ApplyTitleBarInsets();
        }
    }

    private void ApplyTitleBarInsets()
    {
        var titleBar = AppWindow.TitleBar;
        AppTitleBar.Padding = new Thickness(
            Math.Max(titleBar.LeftInset, 0),
            0,
            Math.Max(titleBar.RightInset, 0),
            0);
    }

    public void NavigateToPage(Type pageType)
    {
        ShowFromTray();
        ContentFrame.Navigate(pageType);
    }

    public void ShowFromTray()
    {
        AppWindow.Show();
        Activate();
    }

    public void HideToTray() => AppWindow.Hide();

    public void RefreshTrayMenu() => _trayMenu?.Refresh();

    public async Task RestoreEnabledModulesAsync()
    {
        if (_isRestoringModules)
        {
            return;
        }

        _isRestoringModules = true;
        try
        {
            var settings = HubSettingsStore.Load();
            var registry = App.Services.GetRequiredService<ModuleRegistry>();
            await registry.RestoreEnabledModulesAsync(settings);
            App.MainViewModel.SyncModuleStates();
            App.MainViewModel.RefreshHotkeyConflicts();
            RefreshTrayMenu();
        }
        finally
        {
            _isRestoringModules = false;
        }
    }

    public void NavigateToTag(string tag)
    {
        ShowFromTray();
        SelectNavigationTag(tag);
    }

    private void ApplyStandaloneNavigation(string moduleId)
    {
        Sidebar.SetStandaloneMode(moduleId);
    }

    private static string GetStandaloneTitle(string moduleId) => moduleId switch
    {
        HomeServiceCollectionExtensions.CleanShotModuleId => "CleanShot",
        HomeServiceCollectionExtensions.LightControlsModuleId => "Light Controls",
        _ => "Home",
    };

    private void BuildModuleNavigation()
    {
        if (App.StandaloneModuleId is not null)
        {
            return;
        }

        var registry = App.Services.GetRequiredService<ModuleRegistry>();
        foreach (var module in registry.Modules)
        {
            if (!ModuleNavigation.HasSettingsPage(module.Id))
            {
                continue;
            }

            var glyph = ModuleNavigation.GetIconGlyph(module.Id);

            Sidebar.AddModuleNavItem(module.Id, module.DisplayName, glyph);
        }
    }

    private void OnSidebarNavigationRequested(object sender, string tag)
    {
        NavigateContent(tag);
        PersistLastOpenedPage(tag);
    }

    private void SelectNavigationTag(string tag)
    {
        var resolvedTag = ResolveNavigationTag(tag);
        Sidebar.SelectedTag = resolvedTag;
        NavigateContent(resolvedTag);
    }

    private static string ResolveNavigationTag(string tag) =>
        ModuleNavigation.GetSettingsPageType(tag) is not null || tag is "home" or "general"
            ? tag
            : "home";

    private void NavigateContent(string tag)
    {
        var pageType = tag switch
        {
            "home" => typeof(HomePage),
            "general" => typeof(GeneralPage),
            _ => ModuleNavigation.GetSettingsPageType(tag) ?? typeof(HomePage),
        };

        ContentFrame.Navigate(pageType);
    }

    private static void PersistLastOpenedPage(string tag)
    {
        var settings = HubSettingsStore.Load();
        settings.LastOpenedPage = tag;
        HubSettingsStore.Save(settings);
    }

    private void OnAppWindowClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_forceClose)
        {
            return;
        }

        args.Cancel = true;
        HideToTray();
    }

    private void QuitApplication()
    {
        _forceClose = true;
        Application.Current.Exit();
    }

    private async void OnRootLoaded(object sender, RoutedEventArgs e)
    {
        ApplyTitleBarInsets();

        if (_trayInitialized)
        {
            return;
        }

        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "tray-icon.ico");
        if (File.Exists(iconPath))
        {
            TrayIcon.Icon = new System.Drawing.Icon(iconPath);
        }

        var dispatcher = DispatcherQueue.GetForCurrentThread();
        _trayMenu = new TrayMenuController(TrayIcon, dispatcher, ShowFromTray, QuitApplication);
        TrayIcon.ForceCreate();
        _trayInitialized = true;

        var hwnd = WindowNative.GetWindowHandle(this);
        InstallHotkeyWindowHook(hwnd);

        var cleanShotModule = App.Services.GetRequiredService<CleanShotModule>();
        cleanShotModule.AttachMessageWindow(hwnd);

        try
        {
            await RestoreEnabledModulesAsync();
            SelectNavigationTag(_initialNavigationTag);
        }
        catch (Exception ex)
        {
            var logPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Home",
                "hub-errors.log");
            Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
            File.AppendAllText(logPath, $"{DateTimeOffset.Now:u} OnRootLoaded: {ex}\n");
            SelectNavigationTag("home");
        }
    }

    private void InstallHotkeyWindowHook(IntPtr hwnd)
    {
        _wndProcDelegate = WndProc;
        _originalWndProc = SetWindowLongPtr(hwnd, GwlpWndproc, Marshal.GetFunctionPointerForDelegate(_wndProcDelegate));
    }

    private IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == PowerBroadcast.WmPowerBroadcast && PowerBroadcast.IsResumeFromSleep(wParam))
        {
            _ = RestoreEnabledModulesAsync();
        }

        var cleanShotModule = App.Services.GetRequiredService<CleanShotModule>();
        if (cleanShotModule.TryHandleHotkeyMessage((int)msg, wParam))
        {
            return IntPtr.Zero;
        }

        return CallWindowProc(_originalWndProc, hWnd, msg, wParam, lParam);
    }

    private static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong) =>
        IntPtr.Size == 8
            ? SetWindowLongPtr64(hWnd, nIndex, dwNewLong)
            : SetWindowLong32(hWnd, nIndex, dwNewLong);

    private void OnOpenHomeRequested(object sender, RoutedEventArgs e) => ShowFromTray();
}
