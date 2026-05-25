using CleanShotW.Helpers;
using CleanShotW.Models;
using CleanShotW.Services;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Input;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using WinRT.Interop;
using WinUIEx;
using Windows.Graphics;

namespace CleanShotW.Views;

public sealed partial class CapturePreviewWindow : WindowEx
{
    private const double PreviewMaxWidth = 280;
    private const double PreviewMaxHeight = 180;
    private const double WindowMargin = 24;
    private const double CardPadding = 16;
    private const double ShadowBleed = 8;
    private const int EntranceSlideOffset = 30;
    private static readonly TimeSpan EntranceDuration = TimeSpan.FromMilliseconds(420);

    private CaptureSession? _session;
    private bool _hoverVisible;
    private bool _isConfigured;
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _entranceTimer;
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _copyFeedbackTimer;
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _saveFeedbackTimer;
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _hoverSyncTimer;
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _hoverHideTimer;
    private PreviewMouseHook? _mouseHook;
    private PreviewKeyboardHook? _keyboardHook;
    private CaptureFullSizePreviewWindow? _fullSizePreview;
    private bool _fullSizePreviewVisible;
    private bool _spaceToggleArmed;
    private DateTimeOffset _lastActionAt;
    private Windows.Graphics.PointInt32 _restPosition;
    private DateTimeOffset _entranceStart;

    private const int HoverHideDelayMs = 200;

    public CapturePreviewWindow()
    {
        InitializeComponent();
        PreviewContent.PointerEntered += OnPreviewPointerEntered;
        PreviewContent.PointerExited += OnPreviewPointerExited;
        PreviewContent.PointerMoved += OnPreviewPointerMoved;
        PreviewContent.AddHandler(UIElement.PointerPressedEvent, new PointerEventHandler(OnPreviewPointerPressed), true);
        Activated += OnWindowActivated;
        Closed += (_, _) =>
        {
            StopHoverSyncTimer();
            StopMouseHook();
            StopKeyboardHook();
            CloseFullSizePreview();
        };

        WireClickDiagnostics(CopyButton, "Copy");
        WireClickDiagnostics(SaveButton, "Save");
        WireClickDiagnostics(DismissButton, "Dismiss");
    }

    private void WireClickDiagnostics(Button button, string name)
    {
        button.AddHandler(UIElement.PointerPressedEvent, new PointerEventHandler((_, e) =>
        {
            var point = e.GetCurrentPoint(button).Position;
            AppLog.Info(
                $"Preview pointer pressed on {name} at ({point.X:F0},{point.Y:F0}); " +
                $"hoverVisible={_hoverVisible} hitTest={button.IsHitTestVisible}; " +
                $"foreground={Win32Helper.DescribeForegroundWindow()}");
        }), true);

        button.AddHandler(UIElement.PointerReleasedEvent, new PointerEventHandler((_, e) =>
        {
            var point = e.GetCurrentPoint(button).Position;
            AppLog.Info(
                $"Preview pointer released on {name} at ({point.X:F0},{point.Y:F0}); " +
                $"foreground={Win32Helper.DescribeForegroundWindow()}");
        }), true);
    }

    private void OnWindowActivated(object sender, WindowActivatedEventArgs e)
    {
        AppLog.Info(
            $"Preview window activation={e.WindowActivationState}; " +
            $"foreground={Win32Helper.DescribeForegroundWindow()}");
    }

    private void OnPreviewPointerPressed(object sender, PointerRoutedEventArgs e)
    {
        var point = e.GetCurrentPoint(PreviewContent).Position;
        var source = (e.OriginalSource as FrameworkElement)?.Name ?? e.OriginalSource?.GetType().Name ?? "unknown";
        AppLog.Info(
            $"Preview pointer pressed on content at ({point.X:F0},{point.Y:F0}) source={source}; " +
            $"hoverVisible={_hoverVisible}; foreground={Win32Helper.DescribeForegroundWindow()}");
    }

    public async Task ShowCaptureAsync(CaptureSession session)
    {
        _session = session;
        EnsureConfigured();
        SetHoverVisible(false, immediate: true);

        try
        {
            await LoadPreviewAsync(session);
        }
        catch (Exception ex)
        {
            AppLog.Error(ex);
            return;
        }

        PositionBottomLeft();

        RootHost.Opacity = 0;
        AppWindow.Move(new Windows.Graphics.PointInt32(
            _restPosition.X,
            _restPosition.Y + EntranceSlideOffset));

        AppWindow.Show(false);

        var hwnd = WindowNative.GetWindowHandle(this);
        Win32Helper.MakeToolWindow(hwnd);
        Win32Helper.ShowTopmostNoActivate(hwnd);
        ConfigureInputPassthrough();
        StartMouseHook();

        AppLog.Info(
            $"Preview shown hwnd=0x{hwnd.ToInt64():X}; preview={Win32Helper.DescribeWindow(hwnd)}; " +
            $"foreground={Win32Helper.DescribeForegroundWindow()}");

        PlayEntranceAnimation();
        StartHoverSyncTimer();

        AppLog.Info($"Preview window shown at ({_restPosition.X},{_restPosition.Y}) size {AppWindow.Size.Width}x{AppWindow.Size.Height}");
    }

    private void StartHoverSyncTimer()
    {
        _hoverSyncTimer?.Stop();
        _hoverSyncTimer = DispatcherQueue.GetForCurrentThread().CreateTimer();
        _hoverSyncTimer.Interval = TimeSpan.FromMilliseconds(100);
        _hoverSyncTimer.Tick += (_, _) => RefreshHoverFromCursor();
        _hoverSyncTimer.Start();
        RefreshHoverFromCursor();
    }

    private void StopHoverSyncTimer()
    {
        _hoverSyncTimer?.Stop();
        _hoverSyncTimer = null;
        CancelHoverHide();
    }

    private void CancelHoverHide()
    {
        _hoverHideTimer?.Stop();
        _hoverHideTimer = null;
    }

    private void PlayEntranceAnimation()
    {
        _entranceTimer?.Stop();

        _entranceStart = DateTimeOffset.UtcNow;
        _entranceTimer = DispatcherQueue.GetForCurrentThread().CreateTimer();
        _entranceTimer.Interval = TimeSpan.FromMilliseconds(16);
        _entranceTimer.Tick += (_, _) => OnEntranceTick();
        _entranceTimer.Start();
    }

    private void OnEntranceTick()
    {
        if (_entranceTimer is null)
        {
            return;
        }

        var elapsed = DateTimeOffset.UtcNow - _entranceStart;
        var progress = Math.Clamp(elapsed.TotalMilliseconds / EntranceDuration.TotalMilliseconds, 0, 1);
        var eased = EaseOutCubic(progress);

        var startY = _restPosition.Y + EntranceSlideOffset;
        var currentY = (int)Math.Round(startY + ((_restPosition.Y - startY) * eased));

        AppWindow.Move(new Windows.Graphics.PointInt32(_restPosition.X, currentY));
        RootHost.Opacity = eased;

        if (progress >= 1)
        {
            _entranceTimer.Stop();
            RootHost.Opacity = 1;
            AppWindow.Move(_restPosition);
            RefreshHoverFromCursor();
        }
    }

    private static double EaseOutCubic(double t) => 1 - Math.Pow(1 - t, 3);

    private void EnsureConfigured()
    {
        if (_isConfigured)
        {
            return;
        }

        Title = "CleanShot Preview";
        IsAlwaysOnTop = true;
        IsShownInSwitchers = false;
        IsMinimizable = false;
        IsMaximizable = false;
        IsResizable = false;

        if (Content is FrameworkElement root)
        {
            root.RequestedTheme = ElementTheme.Dark;
        }

        var presenter = AppWindow.Presenter as OverlappedPresenter;
        if (presenter is not null)
        {
            presenter.SetBorderAndTitleBar(false, false);
            presenter.IsAlwaysOnTop = true;
        }

        AppWindow.IsShownInSwitchers = false;
        _isConfigured = true;
    }

    private async Task LoadPreviewAsync(CaptureSession session)
    {
        var bitmap = session.Bitmap;
        var aspect = (double)bitmap.Width / bitmap.Height;

        double previewWidth = PreviewMaxWidth;
        double previewHeight = previewWidth / aspect;

        if (previewHeight > PreviewMaxHeight)
        {
            previewHeight = PreviewMaxHeight;
            previewWidth = previewHeight * aspect;
        }

        PreviewImage.Width = previewWidth;
        PreviewImage.Height = previewHeight;
        ImageClipHost.Width = previewWidth;
        ImageClipHost.Height = previewHeight;
        PreviewImage.Source = await BitmapHelper.ToBitmapImageAsync(bitmap);

        var windowWidth = previewWidth + CardPadding + ShadowBleed;
        var windowHeight = previewHeight + CardPadding + ShadowBleed;
        AppWindow.Resize(new Windows.Graphics.SizeInt32(
            (int)Math.Ceiling(windowWidth),
            (int)Math.Ceiling(windowHeight)));

        ConfigureInputPassthrough();
    }

    private void ConfigureInputPassthrough()
    {
        if (Content is not FrameworkElement)
        {
            return;
        }

        ExtendsContentIntoTitleBar = true;

        var inputSource = InputNonClientPointerSource.GetForWindowId(AppWindow.Id);
        inputSource.ClearRegionRects(NonClientRegionKind.Passthrough);
        inputSource.SetRegionRects(
            NonClientRegionKind.Passthrough,
            [
                new RectInt32(0, 0, AppWindow.Size.Width, AppWindow.Size.Height),
            ]);
    }

    private void StartMouseHook()
    {
        StopMouseHook();
        _mouseHook = new PreviewMouseHook();
        _mouseHook.LeftButtonUp += OnGlobalLeftButtonUp;
    }

    private void StopMouseHook()
    {
        if (_mouseHook is null)
        {
            return;
        }

        _mouseHook.LeftButtonUp -= OnGlobalLeftButtonUp;
        _mouseHook.Dispose();
        _mouseHook = null;
    }

    private void StartKeyboardHook()
    {
        StopKeyboardHook();
        _keyboardHook = new PreviewKeyboardHook();
        _keyboardHook.SpacePressed += OnGlobalSpacePressed;
        _keyboardHook.SpaceReleased += OnGlobalSpaceReleased;
    }

    private void StopKeyboardHook()
    {
        if (_keyboardHook is null)
        {
            return;
        }

        _keyboardHook.SpacePressed -= OnGlobalSpacePressed;
        _keyboardHook.SpaceReleased -= OnGlobalSpaceReleased;
        _keyboardHook.Dispose();
        _keyboardHook = null;
    }

    private void OnGlobalSpacePressed()
    {
        if (_spaceToggleArmed || _session is null)
        {
            return;
        }

        _spaceToggleArmed = true;

        if (DispatcherQueue.HasThreadAccess)
        {
            TryToggleFullSizePreviewFromSpace();
            return;
        }

        _ = DispatcherQueue.TryEnqueue(TryToggleFullSizePreviewFromSpace);
    }

    private void OnGlobalSpaceReleased()
    {
        _spaceToggleArmed = false;
    }

    private void TryToggleFullSizePreviewFromSpace()
    {
        if (!IsSpaceTargetFocused())
        {
            return;
        }

        ToggleFullSizePreviewAsync();
    }

    private void ToggleFullSizePreviewAsync()
    {
        if (_fullSizePreviewVisible)
        {
            HideFullSizePreview("Space");
            return;
        }

        _ = ShowFullSizePreviewAsync();
    }

    private bool IsSpaceTargetFocused()
    {
        if (_fullSizePreviewVisible && _fullSizePreview is not null)
        {
            var fullSizeHwnd = WindowNative.GetWindowHandle(_fullSizePreview);
            return Win32Helper.IsCursorOverWindow(fullSizeHwnd);
        }

        return IsCursorOverPreview();
    }

    private void SyncKeyboardHook()
    {
        if (IsSpaceTargetFocused())
        {
            if (_keyboardHook is null)
            {
                StartKeyboardHook();
            }

            return;
        }

        StopKeyboardHook();
    }

    private async Task ShowFullSizePreviewAsync()
    {
        if (_session is null || _fullSizePreviewVisible)
        {
            return;
        }

        _fullSizePreview ??= CreateFullSizePreviewWindow();
        _fullSizePreviewVisible = true;

        try
        {
            var displayArea = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary);
            await _fullSizePreview.ShowBitmapAsync(_session.Bitmap, displayArea);
            if (!_fullSizePreviewVisible)
            {
                _fullSizePreview.HidePreview();
                return;
            }

            AppLog.Info("Full-size preview opened via Space");
            SyncKeyboardHook();
        }
        catch (Exception ex)
        {
            _fullSizePreviewVisible = false;
            AppLog.Error(ex);
        }
    }

    private CaptureFullSizePreviewWindow CreateFullSizePreviewWindow()
    {
        var window = new CaptureFullSizePreviewWindow();
        window.DismissRequested += OnFullSizePreviewDismissRequested;
        return window;
    }

    private void OnFullSizePreviewDismissRequested()
    {
        if (DispatcherQueue.HasThreadAccess)
        {
            HideFullSizePreview("Dismiss");
            return;
        }

        _ = DispatcherQueue.TryEnqueue(() => HideFullSizePreview("Dismiss"));
    }

    private void HideFullSizePreview(string reason)
    {
        if (!_fullSizePreviewVisible)
        {
            return;
        }

        _fullSizePreviewVisible = false;
        _fullSizePreview?.HidePreview();
        AppLog.Info($"Full-size preview closed via {reason}");
        SyncKeyboardHook();
    }

    private void CloseFullSizePreview()
    {
        _fullSizePreviewVisible = false;
        if (_fullSizePreview is not null)
        {
            _fullSizePreview.DismissRequested -= OnFullSizePreviewDismissRequested;
            _fullSizePreview.Close();
            _fullSizePreview = null;
        }
    }

    private void OnGlobalLeftButtonUp(int screenX, int screenY)
    {
        if (!_hoverVisible || _session is null)
        {
            return;
        }

        var hwnd = WindowNative.GetWindowHandle(this);
        if (!Win32Helper.TryGetWindowScreenBounds(hwnd, out var windowBounds))
        {
            return;
        }

        if (screenX < windowBounds.Left || screenX >= windowBounds.Right ||
            screenY < windowBounds.Top || screenY >= windowBounds.Bottom)
        {
            return;
        }

        if (DispatcherQueue.HasThreadAccess)
        {
            TryHandleHookClick(screenX, screenY);
            return;
        }

        _ = DispatcherQueue.TryEnqueue(() => TryHandleHookClick(screenX, screenY));
    }

    private bool TryBeginAction()
    {
        var now = DateTimeOffset.UtcNow;
        if ((now - _lastActionAt).TotalMilliseconds < 250)
        {
            return false;
        }

        _lastActionAt = now;
        return true;
    }

    private void TryHandleHookClick(int screenX, int screenY)
    {
        if (!_hoverVisible || _session is null)
        {
            return;
        }

        if (IsScreenPointInElement(CopyButton, screenX, screenY))
        {
            if (!TryBeginAction())
            {
                return;
            }

            AppLog.Info($"Preview hook Copy at ({screenX},{screenY}); foreground={Win32Helper.DescribeForegroundWindow()}");
            _ = CopyCaptureAsync();
            return;
        }

        if (IsScreenPointInElement(SaveButton, screenX, screenY))
        {
            if (!TryBeginAction())
            {
                return;
            }

            AppLog.Info($"Preview hook Save at ({screenX},{screenY}); foreground={Win32Helper.DescribeForegroundWindow()}");
            _ = SaveCaptureAsync();
            return;
        }

        if (IsScreenPointInElement(DismissButton, screenX, screenY))
        {
            if (!TryBeginAction())
            {
                return;
            }

            AppLog.Info($"Preview hook Dismiss at ({screenX},{screenY}); foreground={Win32Helper.DescribeForegroundWindow()}");
            DismissPreview();
        }
    }

    private bool IsScreenPointInElement(FrameworkElement element, int screenX, int screenY)
    {
        if (!element.IsHitTestVisible || element.Opacity <= 0.01 || element.ActualWidth <= 0 || element.ActualHeight <= 0)
        {
            return false;
        }

        if (PreviewContent.XamlRoot is null)
        {
            return false;
        }

        var scale = PreviewContent.XamlRoot.RasterizationScale;
        var transform = element.TransformToVisual(null);
        var logical = transform.TransformBounds(new Windows.Foundation.Rect(0, 0, element.ActualWidth, element.ActualHeight));

        if (!Win32Helper.TryGetWindowScreenBounds(WindowNative.GetWindowHandle(this), out var windowBounds))
        {
            return false;
        }

        var left = windowBounds.Left + (int)Math.Floor(logical.X * scale);
        var top = windowBounds.Top + (int)Math.Floor(logical.Y * scale);
        var right = left + (int)Math.Ceiling(logical.Width * scale);
        var bottom = top + (int)Math.Ceiling(logical.Height * scale);

        return screenX >= left && screenX < right && screenY >= top && screenY < bottom;
    }

    private void PositionBottomLeft()
    {
        var displayArea = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary);
        var workArea = displayArea.WorkArea;
        var height = AppWindow.Size.Height;

        _restPosition = new Windows.Graphics.PointInt32(
            workArea.X + (int)WindowMargin,
            workArea.Y + workArea.Height - height - (int)WindowMargin);
    }

    private void OnPreviewPointerEntered(object sender, PointerRoutedEventArgs e)
    {
        SetHoverVisible(true);
    }

    private void OnPreviewPointerExited(object sender, PointerRoutedEventArgs e)
    {
        if (!IsCursorOverPreview())
        {
            SetHoverVisible(false);
        }
    }

    private void OnPreviewPointerMoved(object sender, PointerRoutedEventArgs e)
    {
        var position = e.GetCurrentPoint(PreviewContent).Position;
        var width = PreviewContent.ActualWidth > 0 ? PreviewContent.ActualWidth : AppWindow.Size.Width;
        var height = PreviewContent.ActualHeight > 0 ? PreviewContent.ActualHeight : AppWindow.Size.Height;

        var isOver = position.X >= 0 &&
                     position.Y >= 0 &&
                     position.X <= width &&
                     position.Y <= height;

        SetHoverVisible(isOver);
    }

    private void RefreshHoverFromCursor()
    {
        SetHoverVisible(IsCursorOverPreview());
        SyncKeyboardHook();
    }

    private bool IsCursorOverPreview()
    {
        var hwnd = WindowNative.GetWindowHandle(this);
        return Win32Helper.IsCursorOverWindow(hwnd);
    }

    private void SetHoverVisible(bool visible, bool immediate = false)
    {
        if (visible)
        {
            CancelHoverHide();
            if (_hoverVisible && !immediate)
            {
                return;
            }

            ApplyHoverVisible(true, immediate);
            return;
        }

        if (immediate)
        {
            CancelHoverHide();
            ApplyHoverVisible(false, immediate: true);
            return;
        }

        if (!_hoverVisible)
        {
            return;
        }

        CancelHoverHide();
        _hoverHideTimer = DispatcherQueue.GetForCurrentThread().CreateTimer();
        _hoverHideTimer.Interval = TimeSpan.FromMilliseconds(HoverHideDelayMs);
        _hoverHideTimer.Tick += (_, _) =>
        {
            CancelHoverHide();
            if (!IsCursorOverPreview())
            {
                ApplyHoverVisible(false, immediate: false);
            }
        };
        _hoverHideTimer.Start();
    }

    private void ApplyHoverVisible(bool visible, bool immediate)
    {
        _hoverVisible = visible;

        CopyButton.IsHitTestVisible = visible;
        SaveButton.IsHitTestVisible = visible;
        DismissButton.IsHitTestVisible = visible;
        ActionButtonsHost.IsHitTestVisible = visible;

        AppLog.Info(
            $"Preview hoverVisible={visible}; hitTest copy={CopyButton.IsHitTestVisible} actions={ActionButtonsHost.IsHitTestVisible}; " +
            $"foreground={Win32Helper.DescribeForegroundWindow()}");

        if (immediate)
        {
            HoverDimmer.Opacity = visible ? 1 : 0;
            ActionButtonsHost.Opacity = visible ? 1 : 0;
            DismissButton.Opacity = visible ? 1 : 0;
            SyncKeyboardHook();
            return;
        }

        var target = visible ? 1.0 : 0.0;
        AnimateOpacity(HoverDimmer, target, 160);
        AnimateOpacity(ActionButtonsHost, target, 180);
        AnimateOpacity(DismissButton, target, 180);
        SyncKeyboardHook();
    }

    private static void AnimateOpacity(UIElement target, double to, int durationMs)
    {
        var animation = new DoubleAnimation
        {
            To = to,
            Duration = TimeSpan.FromMilliseconds(durationMs),
            EasingFunction = new CubicEase
            {
                EasingMode = to > target.Opacity ? EasingMode.EaseOut : EasingMode.EaseIn,
            },
        };

        Storyboard.SetTarget(animation, target);
        Storyboard.SetTargetProperty(animation, "Opacity");

        var storyboard = new Storyboard();
        storyboard.Children.Add(animation);
        storyboard.Begin();
    }

    private async void OnCopyClicked(object sender, RoutedEventArgs e)
    {
        if (!TryBeginAction())
        {
            return;
        }

        AppLog.Info($"Preview Copy clicked; foreground={Win32Helper.DescribeForegroundWindow()}");
        await CopyCaptureAsync();
    }

    private async Task CopyCaptureAsync()
    {
        if (_session is null)
        {
            return;
        }

        await ClipboardService.CopyBitmapAsync(_session.Bitmap);
        ShowButtonFeedback(CopyButton, "Copy", "Copied", isCopy: true);
    }

    private async void OnSaveClicked(object sender, RoutedEventArgs e)
    {
        if (!TryBeginAction())
        {
            return;
        }

        AppLog.Info($"Preview Save clicked; foreground={Win32Helper.DescribeForegroundWindow()}");
        await SaveCaptureAsync();
    }

    private Task SaveCaptureAsync()
    {
        if (_session is null)
        {
            return Task.CompletedTask;
        }

        var path = SaveService.SaveBitmap(_session.Bitmap);
        _ = path;
        ShowButtonFeedback(SaveButton, "Save", "Saved", isCopy: false);
        return Task.CompletedTask;
    }

    private void ShowButtonFeedback(Button button, string originalText, string feedbackText, bool isCopy)
    {
        var timer = isCopy ? _copyFeedbackTimer : _saveFeedbackTimer;
        timer?.Stop();

        button.Content = feedbackText;
        button.IsEnabled = false;

        var scale = new ScaleTransform
        {
            ScaleX = 0.88,
            ScaleY = 0.88,
            CenterX = button.ActualWidth > 0 ? button.ActualWidth / 2 : 40,
            CenterY = button.ActualHeight > 0 ? button.ActualHeight / 2 : 16,
        };
        button.RenderTransform = scale;

        var popX = new DoubleAnimation
        {
            From = 0.88,
            To = 1,
            Duration = TimeSpan.FromMilliseconds(260),
            EasingFunction = new BackEase { Amplitude = 0.35, EasingMode = EasingMode.EaseOut },
        };

        var popY = new DoubleAnimation
        {
            From = 0.88,
            To = 1,
            Duration = TimeSpan.FromMilliseconds(260),
            EasingFunction = new BackEase { Amplitude = 0.35, EasingMode = EasingMode.EaseOut },
        };

        Storyboard.SetTarget(popX, scale);
        Storyboard.SetTargetProperty(popX, "ScaleX");
        Storyboard.SetTarget(popY, scale);
        Storyboard.SetTargetProperty(popY, "ScaleY");

        var storyboard = new Storyboard();
        storyboard.Children.Add(popX);
        storyboard.Children.Add(popY);
        storyboard.Begin();

        timer = DispatcherQueue.GetForCurrentThread().CreateTimer();
        timer.Interval = TimeSpan.FromSeconds(2);
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            button.Content = originalText;
            button.IsEnabled = true;
            button.RenderTransform = null;
        };
        timer.Start();

        if (isCopy)
        {
            _copyFeedbackTimer = timer;
        }
        else
        {
            _saveFeedbackTimer = timer;
        }
    }

    private void OnDismissClicked(object sender, RoutedEventArgs e)
    {
        if (!TryBeginAction())
        {
            return;
        }

        AppLog.Info($"Preview Dismiss clicked; foreground={Win32Helper.DescribeForegroundWindow()}");
        DismissPreview();
    }

    private void DismissPreview()
    {
        _entranceTimer?.Stop();
        StopHoverSyncTimer();
        CancelHoverHide();
        StopMouseHook();
        StopKeyboardHook();
        CloseFullSizePreview();
        _copyFeedbackTimer?.Stop();
        _saveFeedbackTimer?.Stop();
        _session?.Dispose();
        _session = null;
        Close();
    }
}
