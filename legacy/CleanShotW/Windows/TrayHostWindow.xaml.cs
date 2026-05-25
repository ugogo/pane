using System.Runtime.InteropServices;
using CleanShot.Core.Services;
using CleanShot.WinUI.Helpers;
using CleanShot.WinUI.Services;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using WinRT.Interop;
using WinUIEx;

namespace CleanShotW.Views;

public sealed partial class TrayHostWindow : WindowEx
{
    private const int GwlpWndproc = -4;

    private readonly CaptureCoordinator _coordinator;
    private XamlUICommand? _captureScreenCommand;
    private XamlUICommand? _captureAreaCommand;
    private readonly DispatcherQueue _dispatcher;
    private HotkeyService? _hotkeyService;
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

    public TrayHostWindow(CaptureCoordinator coordinator)
    {
        _coordinator = coordinator;
        _dispatcher = DispatcherQueue.GetForCurrentThread();
        InitializeComponent();
        ConfigureWindow();
        LoadTrayIcon();
        BuildTrayMenu();
        _coordinator.ApplyHotkeys = RegisterHotkeys;
        Activated += OnActivated;
    }

    private void ConfigureWindow()
    {
        Title = "CleanShot W";
        Width = 1;
        Height = 1;
        IsShownInSwitchers = false;
        IsMinimizable = false;
        IsMaximizable = false;
        IsResizable = false;
    }

    private void LoadTrayIcon()
    {
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "tray-icon.ico");
        if (!File.Exists(iconPath))
        {
            AppLog.Error($"Tray icon not found at {iconPath}");
            return;
        }

        TrayIcon.Icon = new System.Drawing.Icon(iconPath);
    }

    private void BuildTrayMenu()
    {
        var menu = new MenuFlyout();

        _captureScreenCommand = CreateMenuCommand(
            FormatCaptureMenuLabel("Capture Screen", HotkeyConfiguration.FullScreenDisplay),
            () => RunCapture(_coordinator.BeginFullScreenCapture));
        menu.Items.Add(new MenuFlyoutItem { Command = _captureScreenCommand });

        _captureAreaCommand = CreateMenuCommand(
            FormatCaptureMenuLabel("Capture Area", HotkeyConfiguration.RegionDisplay),
            () => RunCapture(_coordinator.BeginRegionCapture));
        menu.Items.Add(new MenuFlyoutItem { Command = _captureAreaCommand });

        menu.Items.Add(new MenuFlyoutSeparator());

        menu.Items.Add(new MenuFlyoutItem
        {
            Command = CreateMenuCommand("Settings", () => RunCapture(() =>
                SettingsWindow.ShowOrActivate(_coordinator))),
        });

        menu.Items.Add(new MenuFlyoutItem
        {
            Command = CreateMenuCommand("Open Save Folder", () => RunCapture(() =>
            {
                var folder = SaveService.GetSaveFolder();
                Directory.CreateDirectory(folder);
                System.Diagnostics.Process.Start("explorer.exe", folder);
            })),
        });

        menu.Items.Add(new MenuFlyoutSeparator());

        menu.Items.Add(new MenuFlyoutItem
        {
            Command = CreateMenuCommand("Quit CleanShot W", () => RunCapture(QuitApplication)),
        });

        TrayIcon.ContextFlyout = menu;
    }

    private static XamlUICommand CreateMenuCommand(string label, Action action)
    {
        var command = new XamlUICommand { Label = label };
        command.ExecuteRequested += (_, _) => action();
        return command;
    }

    private void RunCapture(Action action)
    {
        AppLog.Info("Tray menu action selected");
        if (_dispatcher.HasThreadAccess)
        {
            action();
            return;
        }

        if (!_dispatcher.TryEnqueue(() => action()))
        {
            AppLog.Error("Failed to dispatch tray menu action to UI thread");
        }
    }

    private void OnActivated(object sender, WindowActivatedEventArgs args)
    {
        if (!_trayInitialized)
        {
            TrayIcon.ForceCreate();
            AppWindow.Hide();
            _trayInitialized = true;
            AppLog.Info("Tray host activated and tray icon created");
        }

        if (_hotkeyService is not null)
        {
            return;
        }

        var hwnd = WindowNative.GetWindowHandle(this);
        _wndProcDelegate = WndProc;
        _originalWndProc = SetWindowLongPtr(hwnd, GwlpWndproc, Marshal.GetFunctionPointerForDelegate(_wndProcDelegate));

        _hotkeyService = new HotkeyService(hwnd);
        _hotkeyService.HotkeyPressed += OnHotkeyPressed;

        if (!RegisterHotkeys())
        {
            AppLog.Error("Failed to register global hotkeys");
        }
        else
        {
            AppLog.Info("Global hotkeys registered");
        }
    }

    private bool RegisterHotkeys()
    {
        if (_hotkeyService is null)
        {
            return false;
        }

        var registered = _hotkeyService.Register();
        if (registered)
        {
            UpdateTrayMenuHotkeyLabels();
        }

        return registered;
    }

    private void ReregisterHotkeysAfterResume()
    {
        RunCapture(() =>
        {
            if (_hotkeyService is null)
            {
                return;
            }

            if (!RegisterHotkeys())
            {
                AppLog.Error("Failed to re-register hotkeys after resume");
            }
            else
            {
                AppLog.Info("Global hotkeys re-registered after resume");
            }
        });
    }

    private void UpdateTrayMenuHotkeyLabels()
    {
        if (_captureScreenCommand is not null)
        {
            _captureScreenCommand.Label = FormatCaptureMenuLabel("Capture Screen", HotkeyConfiguration.FullScreenDisplay);
        }

        if (_captureAreaCommand is not null)
        {
            _captureAreaCommand.Label = FormatCaptureMenuLabel("Capture Area", HotkeyConfiguration.RegionDisplay);
        }
    }

    private static string FormatCaptureMenuLabel(string label, string shortcut) => $"{label}  ·  {shortcut}";

    private void QuitApplication()
    {
        AppLog.Info("Quit requested from tray menu");
        _coordinator.Shutdown();
        _hotkeyService?.Dispose();
        _hotkeyService = null;
        Close();
        Environment.Exit(0);
    }

    private void OnHotkeyPressed(int hotkeyId)
    {
        AppLog.Info($"Hotkey pressed: {hotkeyId}");
        RunCapture(() =>
        {
            switch (hotkeyId)
            {
                case HotkeyService.HotkeyFullScreen:
                    _coordinator.BeginFullScreenCapture();
                    break;
                case HotkeyService.HotkeyRegion:
                    _coordinator.BeginRegionCapture();
                    break;
            }
        });
    }

    private IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (_hotkeyService?.TryHandleMessage((int)msg, wParam) == true)
        {
            return IntPtr.Zero;
        }

        if (msg == Win32Helper.WmPowerBroadcast)
        {
            var powerEvent = wParam.ToInt32();
            if (powerEvent is Win32Helper.PbtApmResumeAutomatic or Win32Helper.PbtApmResumeSuspend)
            {
                AppLog.Info("System resumed from sleep");
                ReregisterHotkeysAfterResume();
            }

            return new IntPtr(1);
        }

        return CallWindowProc(_originalWndProc, hWnd, msg, wParam, lParam);
    }

    private static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong)
    {
        return IntPtr.Size == 8
            ? SetWindowLongPtr64(hWnd, nIndex, dwNewLong)
            : SetWindowLong32(hWnd, nIndex, dwNewLong);
    }
}
