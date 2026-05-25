using System.Runtime.InteropServices;
using CleanShotW.Helpers;
using Home.Hub.Modules;
using Home.Hub.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using WinRT.Interop;
using WinUIEx;

namespace Home.Hub;

public sealed partial class MainWindow : WindowEx
{
    private const int GwlpWndproc = -4;

    private bool _trayInitialized;
    private IntPtr _originalWndProc;
    private WndProcDelegate? _wndProcDelegate;

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

        NavView.SelectedItem = NavView.MenuItems[0];
        ContentFrame.Navigate(typeof(HomePage));

        NavView.SelectionChanged += OnNavigationSelectionChanged;
        Closed += (_, _) => Application.Current.Exit();
    }

    public void ShowFromTray()
    {
        AppWindow.Show();
        Activate();
    }

    private void OnNavigationSelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem item || item.Tag is not string tag)
        {
            return;
        }

        Type pageType = tag switch
        {
            "home" => typeof(HomePage),
            "general" => typeof(GeneralPage),
            _ => typeof(HomePage),
        };

        ContentFrame.Navigate(pageType);
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
