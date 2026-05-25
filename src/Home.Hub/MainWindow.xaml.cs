using System.Runtime.InteropServices;
using H.NotifyIcon;
using Home.Core;
using Home.Hub.Modules;
using Home.Hub.Navigation;
using Home.Hub.Tray;
using Home.Hub.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using WinRT.Interop;
using WinUIEx;

namespace Home.Hub;

public sealed partial class MainWindow : WindowEx
{
    private const int GwlpWndproc = -4;

    private bool _trayInitialized;
    private bool _forceClose;
    private IntPtr _originalWndProc;
    private WndProcDelegate? _wndProcDelegate;
    private TrayMenuController? _trayMenu;

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

        BuildModuleNavigation();

        var settings = HubSettingsStore.Load();
        SelectNavigationTag(settings.LastOpenedPage);

        NavView.SelectionChanged += OnNavigationSelectionChanged;
        AppWindow.Closing += OnAppWindowClosing;
    }

    public void ShowFromTray()
    {
        AppWindow.Show();
        Activate();
    }

    public void HideToTray() => AppWindow.Hide();

    public void RefreshTrayMenu() => _trayMenu?.Refresh();

    public void NavigateToTag(string tag)
    {
        ShowFromTray();

        foreach (var item in NavView.MenuItems.OfType<NavigationViewItem>())
        {
            if (item.Tag as string == tag)
            {
                NavView.SelectedItem = item;
                return;
            }
        }
    }

    private void BuildModuleNavigation()
    {
        var registry = App.Services.GetRequiredService<ModuleRegistry>();
        var insertIndex = NavView.MenuItems.Count - 1;

        foreach (var module in registry.Modules)
        {
            if (!ModuleNavigation.HasSettingsPage(module.Id))
            {
                continue;
            }

            NavView.MenuItems.Insert(insertIndex++, new NavigationViewItem
            {
                Content = module.DisplayName,
                Tag = module.Id,
                Icon = new SymbolIcon(ModuleNavigation.GetIcon(module.Id)),
            });
        }
    }

    private void SelectNavigationTag(string tag)
    {
        var match = NavView.MenuItems
            .OfType<NavigationViewItem>()
            .FirstOrDefault(item => item.Tag as string == tag);

        NavView.SelectedItem = match ?? NavView.MenuItems[0];
    }

    private void OnNavigationSelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem item || item.Tag is not string tag)
        {
            return;
        }

        var pageType = tag switch
        {
            "home" => typeof(HomePage),
            "general" => typeof(GeneralPage),
            _ => ModuleNavigation.GetSettingsPageType(tag) ?? typeof(HomePage),
        };

        ContentFrame.Navigate(pageType);
        PersistLastOpenedPage(tag);
    }

    private static void PersistLastOpenedPage(string tag)
    {
        var settings = HubSettingsStore.Load();
        settings.LastOpenedPage = tag;
        HubSettingsStore.Save(settings);
    }

    private void OnAppWindowClosing(Microsoft.UI.Windowing.AppWindow sender, Microsoft.UI.Windowing.AppWindowClosingEventArgs args)
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

        if (cleanShotModule.IsEnabled)
        {
            await cleanShotModule.DisableAsync();
            await cleanShotModule.EnableAsync();
        }

        RefreshTrayMenu();
    }

    private void InstallHotkeyWindowHook(IntPtr hwnd)
    {
        _wndProcDelegate = WndProc;
        _originalWndProc = SetWindowLongPtr(hwnd, GwlpWndproc, Marshal.GetFunctionPointerForDelegate(_wndProcDelegate));
    }

    private IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
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
