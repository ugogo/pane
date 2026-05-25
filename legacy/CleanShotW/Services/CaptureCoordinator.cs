using CleanShotW.Models;
using CleanShotW.Views;
using CleanShotW.Helpers;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using WinRT.Interop;

namespace CleanShotW.Services;

public sealed class CaptureCoordinator
{
    private readonly DispatcherQueue _dispatcher;
    private CapturePreviewWindow? _previewWindow;
    private RegionSelectorWindow? _regionSelector;
    private CaptureSession? _activeSession;
    private IntPtr _returnFocusHwnd;

    public CaptureCoordinator(DispatcherQueue dispatcher)
    {
        _dispatcher = dispatcher;
    }

    public Func<bool>? ApplyHotkeys { get; set; }

    public void BeginFullScreenCapture()
    {
        AppLog.Info("BeginFullScreenCapture requested");
        RunOnUiThread(() =>
        {
            RememberForegroundWindow();
            StartFullScreenCaptureAfterDelay();
        });
    }

    public void BeginRegionCapture()
    {
        AppLog.Info("BeginRegionCapture requested");
        RunOnUiThread(() =>
        {
            RememberForegroundWindow();
            StartRegionCapture();
        });
    }

    public bool TryApplyHotkeys(string fullScreenShortcut, string regionShortcut, out string error)
    {
        return HotkeySettingsApplier.TryApply(
            fullScreenShortcut,
            regionShortcut,
            () => ApplyHotkeys?.Invoke() ?? true,
            out error);
    }

    private void StartFullScreenCaptureAfterDelay()
    {
        var timer = _dispatcher.CreateTimer();
        timer.Interval = TimeSpan.FromMilliseconds(180);
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            try
            {
                AppLog.Info("Capturing full screen");
                var bitmap = ScreenshotService.CaptureFullScreen();
                AppLog.Info($"Captured full screen {bitmap.Width}x{bitmap.Height}");
                ReplaceActiveSession(new CaptureSession(bitmap));
                if (_activeSession is not null)
                {
                    _ = ShowOverlayAsync(_activeSession, playSound: true);
                }
            }
            catch (Exception ex)
            {
                AppLog.Error(ex);
            }
        };
        timer.Start();
    }

    private void StartRegionCapture()
    {
        if (_regionSelector is not null)
        {
            AppLog.Info("Region selector already open");
            return;
        }

        _regionSelector = new RegionSelectorWindow();
        _regionSelector.RegionCaptured += OnRegionCaptured;
        _regionSelector.SelectionCancelled += OnRegionCancelled;
        _regionSelector.Closed += OnRegionSelectorClosed;
        _regionSelector.StartListening();
        AppLog.Info("Region selector listening");
    }

    private void OnRegionCancelled(object? sender, EventArgs e)
    {
        AppLog.Info("Region capture cancelled");
    }

    private void OnRegionCaptured(object? sender, System.Drawing.Rectangle bounds)
    {
        AppLog.Info($"Region selected {bounds.Width}x{bounds.Height} at ({bounds.X},{bounds.Y})");

        var timer = _dispatcher.CreateTimer();
        timer.Interval = TimeSpan.FromMilliseconds(120);
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            try
            {
                var bitmap = ScreenshotService.CaptureRegion(bounds);
                AppLog.Info($"Captured region {bitmap.Width}x{bitmap.Height}");
                ReplaceActiveSession(new CaptureSession(bitmap));
                if (_activeSession is not null)
                {
                    _ = ShowOverlayAsync(_activeSession, playSound: true);
                }
            }
            catch (Exception ex)
            {
                AppLog.Error(ex);
            }
        };
        timer.Start();
    }

    private void OnRegionSelectorClosed(object? sender, WindowEventArgs e)
    {
        DetachRegionSelector();
    }

    private void CleanupRegionSelector()
    {
        if (_regionSelector is null)
        {
            return;
        }

        _regionSelector.Close();
    }

    private void DetachRegionSelector()
    {
        if (_regionSelector is null)
        {
            return;
        }

        _regionSelector.RegionCaptured -= OnRegionCaptured;
        _regionSelector.SelectionCancelled -= OnRegionCancelled;
        _regionSelector.Closed -= OnRegionSelectorClosed;
        _regionSelector = null;
    }

    private void ReplaceActiveSession(CaptureSession session)
    {
        if (_activeSession is not null && !ReferenceEquals(_activeSession, session))
        {
            _activeSession.Dispose();
        }

        _activeSession = session;
    }

    private async Task ShowOverlayAsync(CaptureSession session, bool playSound)
    {
        if (_previewWindow is not null)
        {
            _previewWindow.Close();
            _previewWindow = null;
        }

        _previewWindow = new CapturePreviewWindow();
        _previewWindow.Closed += (_, _) => _previewWindow = null;

        try
        {
            await _previewWindow.ShowCaptureAsync(session);
            RestoreCapturedForegroundWindow();
            if (playSound)
            {
                CaptureSoundService.PlayCaptureComplete();
            }

            AppLog.Info(playSound ? "Preview shown and capture sound played" : "Preview shown");
        }
        catch (Exception ex)
        {
            AppLog.Error(ex);
        }
    }

    private void HideOverlay()
    {
        _previewWindow?.Close();
        _previewWindow = null;
    }

    public void DismissActiveCapture()
    {
        _activeSession?.Dispose();
        _activeSession = null;
        HideOverlay();
    }

    public void Shutdown()
    {
        CleanupRegionSelector();
        DismissActiveCapture();
    }

    private void RunOnUiThread(Action action)
    {
        if (_dispatcher.HasThreadAccess)
        {
            action();
            return;
        }

        if (!_dispatcher.TryEnqueue(() => action()))
        {
            AppLog.Error("Failed to enqueue UI work");
        }
    }

    private void RememberForegroundWindow()
    {
        var hwnd = Win32Helper.GetForegroundWindow();
        _returnFocusHwnd = Win32Helper.IsCurrentProcessWindow(hwnd) ? IntPtr.Zero : hwnd;
        AppLog.Info(_returnFocusHwnd == IntPtr.Zero
            ? $"Capture remembered foreground: skipped internal window {Win32Helper.DescribeWindow(hwnd)}"
            : $"Capture remembered foreground: {Win32Helper.DescribeWindow(_returnFocusHwnd)}");
    }

    private void RestoreCapturedForegroundWindow()
    {
        AppLog.Info($"Before focus restore, foreground is {Win32Helper.DescribeForegroundWindow()}");

        if (_returnFocusHwnd == IntPtr.Zero)
        {
            AppLog.Info("Focus restore skipped: no external foreground was remembered");
            return;
        }

        Win32Helper.TryRestoreForegroundWindow(_returnFocusHwnd);
        _returnFocusHwnd = IntPtr.Zero;
    }
}
