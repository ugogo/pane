using System.Drawing;
using CleanShotW.Helpers;
using CleanShotW.Services;
using Microsoft.UI.Input;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using WinRT.Interop;
using WinUIEx;
using Windows.Graphics;

namespace CleanShotW.Views;

public sealed partial class CaptureFullSizePreviewWindow : WindowEx
{
    private const double WindowPadding = 20;
    private const double ScreenMargin = 32;

    private bool _isConfigured;
    private PreviewMouseHook? _mouseHook;
    private bool _isDragging;
    private PointInt32 _dragStartCursor;
    private PointInt32 _dragStartWindowPos;
    private bool _dragMoved;

    public event Action? DismissRequested;

    public CaptureFullSizePreviewWindow()
    {
        InitializeComponent();
        Closed += (_, _) => StopMouseHook();
    }

    public async Task ShowBitmapAsync(Bitmap bitmap, DisplayArea displayArea)
    {
        EnsureConfigured();

        var workArea = displayArea.WorkArea;
        var maxWidth = workArea.Width - (int)ScreenMargin;
        var maxHeight = workArea.Height - (int)ScreenMargin;

        var displayWidth = (double)bitmap.Width;
        var displayHeight = (double)bitmap.Height;

        if (displayWidth > maxWidth || displayHeight > maxHeight)
        {
            var scale = Math.Min(maxWidth / displayWidth, maxHeight / displayHeight);
            displayWidth = Math.Floor(displayWidth * scale);
            displayHeight = Math.Floor(displayHeight * scale);
        }

        FullSizeImage.Width = displayWidth;
        FullSizeImage.Height = displayHeight;
        FullSizeImage.Source = await BitmapHelper.ToBitmapImageAsync(bitmap);

        var windowWidth = (int)Math.Ceiling(displayWidth + WindowPadding);
        var windowHeight = (int)Math.Ceiling(displayHeight + WindowPadding);
        AppWindow.Resize(new SizeInt32(windowWidth, windowHeight));

        var position = new PointInt32(
            workArea.X + (workArea.Width - windowWidth) / 2,
            workArea.Y + (workArea.Height - windowHeight) / 2);

        AppWindow.Move(position);
        ConfigureInputPassthrough();
        StartMouseHook();

        var hwnd = WindowNative.GetWindowHandle(this);
        Win32Helper.MakeToolWindow(hwnd);
        Win32Helper.ShowTopmostNoActivate(hwnd);

        AppLog.Info(
            $"Full-size preview shown {bitmap.Width}x{bitmap.Height} " +
            $"displayed at {displayWidth:F0}x{displayHeight:F0} centered on work area");
    }

    public void HidePreview()
    {
        StopMouseHook();
        AppWindow.Hide();
    }

    private void OnDismissClicked(object sender, RoutedEventArgs e)
    {
        AppLog.Info("Full-size preview dismiss clicked");
        DismissRequested?.Invoke();
    }

    private void StartMouseHook()
    {
        StopMouseHook();
        _mouseHook = new PreviewMouseHook();
        _mouseHook.LeftButtonDown += OnGlobalLeftButtonDown;
        _mouseHook.LeftButtonDragged += OnGlobalLeftButtonDragged;
        _mouseHook.LeftButtonUp += OnGlobalLeftButtonUp;
    }

    private void StopMouseHook()
    {
        if (_mouseHook is null)
        {
            return;
        }

        _mouseHook.LeftButtonDown -= OnGlobalLeftButtonDown;
        _mouseHook.LeftButtonDragged -= OnGlobalLeftButtonDragged;
        _mouseHook.LeftButtonUp -= OnGlobalLeftButtonUp;
        _mouseHook.Dispose();
        _mouseHook = null;
        _isDragging = false;
        _dragMoved = false;
    }

    private void OnGlobalLeftButtonDown(int screenX, int screenY)
    {
        EnqueueMouseHook(() => TryBeginDrag(screenX, screenY));
    }

    private void OnGlobalLeftButtonDragged(int screenX, int screenY)
    {
        EnqueueMouseHook(() => ApplyDrag(screenX, screenY));
    }

    private void OnGlobalLeftButtonUp(int screenX, int screenY)
    {
        EnqueueMouseHook(() => TryHandleHookClick(screenX, screenY));
    }

    private void EnqueueMouseHook(Action action)
    {
        if (DispatcherQueue.HasThreadAccess)
        {
            action();
            return;
        }

        _ = DispatcherQueue.TryEnqueue(() => action());
    }

    private void TryBeginDrag(int screenX, int screenY)
    {
        if (!IsPointInWindow(screenX, screenY) || IsScreenPointInElement(DismissButton, screenX, screenY))
        {
            return;
        }

        _isDragging = true;
        _dragMoved = false;
        _dragStartCursor = new PointInt32(screenX, screenY);
        _dragStartWindowPos = AppWindow.Position;
    }

    private void ApplyDrag(int screenX, int screenY)
    {
        if (!_isDragging)
        {
            return;
        }

        var dx = screenX - _dragStartCursor.X;
        var dy = screenY - _dragStartCursor.Y;

        if (!_dragMoved && Math.Abs(dx) < 2 && Math.Abs(dy) < 2)
        {
            return;
        }

        _dragMoved = true;
        AppWindow.Move(new PointInt32(_dragStartWindowPos.X + dx, _dragStartWindowPos.Y + dy));
    }

    private void TryHandleHookClick(int screenX, int screenY)
    {
        if (_isDragging)
        {
            _isDragging = false;

            if (_dragMoved)
            {
                return;
            }
        }

        if (IsScreenPointInElement(DismissButton, screenX, screenY))
        {
            AppLog.Info($"Full-size preview hook Dismiss at ({screenX},{screenY})");
            DismissRequested?.Invoke();
        }
    }

    private bool IsPointInWindow(int screenX, int screenY)
    {
        if (!Win32Helper.TryGetWindowScreenBounds(WindowNative.GetWindowHandle(this), out var bounds))
        {
            return false;
        }

        return screenX >= bounds.Left &&
               screenX < bounds.Right &&
               screenY >= bounds.Top &&
               screenY < bounds.Bottom;
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

    private void EnsureConfigured()
    {
        if (_isConfigured)
        {
            return;
        }

        Title = "CleanShot Full Preview";
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

    private void ConfigureInputPassthrough()
    {
        ExtendsContentIntoTitleBar = true;

        var inputSource = InputNonClientPointerSource.GetForWindowId(AppWindow.Id);
        inputSource.ClearRegionRects(NonClientRegionKind.Passthrough);
        inputSource.SetRegionRects(
            NonClientRegionKind.Passthrough,
            [
                new RectInt32(0, 0, AppWindow.Size.Width, AppWindow.Size.Height),
            ]);
    }
}
