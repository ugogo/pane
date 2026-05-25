using System.Drawing;
using CleanShot.WinUI.Helpers;
using CleanShot.WinUI.Services;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using WinRT.Interop;
using WinUIEx;

namespace CleanShot.WinUI.Views;

public sealed partial class RegionSelectorWindow : WindowEx
{
    private enum InteractionMode
    {
        None,
        Listening,
        Creating,
    }

    private bool _isConfigured;
    private bool _isClosing;
    private bool _isWindowVisible;
    private bool _hookDragging;
    private bool _awaitingFirstDrag;
    private bool _spaceHeld;
    private bool _spaceMoveActive;
    private int _spaceMoveWidth;
    private int _spaceMoveHeight;
    private InteractionMode _mode = InteractionMode.None;
    private Windows.Foundation.Point _startPoint;
    private Windows.Foundation.Point _currentPoint;
    private Rectangle _selection;
    private Rectangle _virtualBounds;
    private RegionSelectorKeyboardHook? _keyboardHook;
    private RegionSelectorMouseHook? _mouseHook;
    private Microsoft.UI.Dispatching.DispatcherQueue? _dispatcher;
    private Windows.Foundation.Point _spaceMoveGrabOffset;
    private IntPtr _hwnd;

    public event EventHandler<Rectangle>? RegionCaptured;
    public event EventHandler? SelectionCancelled;

    public RegionSelectorWindow()
    {
        InitializeComponent();
        _dispatcher = Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread();
        RootGrid.SizeChanged += OnRootGridSizeChanged;
        Closed += OnClosed;
    }

    public void StartListening()
    {
        RunOnUiThread(() => _ = StartListeningAsync());
    }

    private async Task StartListeningAsync()
    {
        if (_mode == InteractionMode.Listening || _isClosing)
        {
            return;
        }

        EnsureConfigured();

        _virtualBounds = Win32Helper.GetVirtualScreenBounds();

        var hwnd = WindowNative.GetWindowHandle(this);
        _hwnd = hwnd;
        Win32Helper.MakeOverlayWindow(hwnd);
        Win32Helper.MoveAndResizeHidden(hwnd, _virtualBounds);

        try
        {
            using var bitmap = ScreenshotService.CaptureRegion(_virtualBounds);
            ScreenBackground.Source = await BitmapHelper.ToBitmapImageAsync(bitmap);
        }
        catch (Exception ex)
        {
            AppLog.Error(ex);
            CancelSelection();
            return;
        }

        InstallKeyboardHook();
        InstallMouseHook();
        HideSelectionChrome();

        RootGrid.PointerPressed += OnPointerPressed;
        RootGrid.PointerMoved += OnPointerMoved;
        RootGrid.PointerReleased += OnPointerReleased;
        RootGrid.RightTapped += OnRightTapped;
        RootGrid.KeyDown += OnKeyDown;
        RootGrid.KeyUp += OnKeyUp;

        ShowSelectorWindow();
        HideShades();
        UpdateSelectionCursor();

        _mode = InteractionMode.Listening;
        AppLog.Info($"Region selector armed {_virtualBounds.Width}x{_virtualBounds.Height} at ({_virtualBounds.X},{_virtualBounds.Y})");
    }

    private void EnsureConfigured()
    {
        if (_isConfigured)
        {
            return;
        }

        Title = "Select Region";
        IsAlwaysOnTop = true;
        IsShownInSwitchers = false;
        IsMinimizable = false;
        IsMaximizable = false;
        IsResizable = false;

        var presenter = AppWindow.Presenter as OverlappedPresenter;
        if (presenter is not null)
        {
            presenter.SetBorderAndTitleBar(false, false);
            presenter.IsAlwaysOnTop = true;
        }

        AppWindow.IsShownInSwitchers = false;
        _isConfigured = true;
    }

    private void InstallMouseHook()
    {
        _mouseHook = new RegionSelectorMouseHook
        {
            IsMoveMode = () => _spaceHeld && _mode == InteractionMode.Creating && !_awaitingFirstDrag,
        };
        _mouseHook.LeftButtonPressed += OnGlobalMousePressed;
        _mouseHook.LeftButtonDragged += OnGlobalMouseDragged;
        _mouseHook.LeftButtonReleased += OnGlobalMouseReleased;
    }

    private void OnGlobalMousePressed(int screenX, int screenY)
    {
        RunOnUiThread(() => BeginCreateDrag(ScreenToLogical(screenX, screenY), fromHook: true));
    }

    private void OnGlobalMouseDragged(int screenX, int screenY)
    {
        RunOnUiThread(() => ContinueCreateDrag(ScreenToLogical(screenX, screenY)));
    }

    private void OnGlobalMouseReleased(int screenX, int screenY)
    {
        RunOnUiThread(() => EndCreateDrag(ScreenToLogical(screenX, screenY), fromHook: true));
    }

    private void BeginCreateDrag(Windows.Foundation.Point point, bool fromHook)
    {
        if (_isClosing || _mode != InteractionMode.Listening)
        {
            return;
        }

        if (!fromHook && _hookDragging)
        {
            return;
        }

        ShowSelectorWindow();

        _mode = InteractionMode.Creating;
        _awaitingFirstDrag = true;
        _spaceMoveActive = false;
        _hookDragging = fromHook;
        _startPoint = point;
        _currentPoint = point;
        HideSelectionChrome();
        HideShades();

        if (!fromHook)
        {
            StopMouseHook();
        }
    }

    private void ContinueCreateDrag(Windows.Foundation.Point point)
    {
        if (_mode != InteractionMode.Creating)
        {
            return;
        }

        _currentPoint = point;
        UpdateCreatingSelection();
    }

    private void EndCreateDrag(Windows.Foundation.Point point, bool fromHook)
    {
        if (_mode != InteractionMode.Creating)
        {
            return;
        }

        if (fromHook && !_hookDragging)
        {
            return;
        }

        _hookDragging = false;
        _currentPoint = point;

        if (fromHook)
        {
            StopMouseHook();
        }

        MaybeBeginDragVisuals();
        if (_awaitingFirstDrag)
        {
            CancelSelection();
            return;
        }

        FinalizeCreatingSelection();
        ConfirmCapture();
    }

    private void UpdateCreatingSelection()
    {
        MaybeBeginDragVisuals();

        if (_spaceHeld)
        {
            if (!_awaitingFirstDrag)
            {
                EnsureSpaceMoveActive();
                ApplySpaceMove(_currentPoint);
            }
        }
        else
        {
            _spaceMoveActive = false;
            if (!_awaitingFirstDrag)
            {
                _selection = GetCreatingRect();
            }
        }

        var visual = _awaitingFirstDrag ? GetCreatingRect() : _selection;
        UpdateSelectionVisuals(visual);
    }

    private void FinalizeCreatingSelection()
    {
        if (_spaceHeld)
        {
            EnsureSpaceMoveActive();
            ApplySpaceMove(_currentPoint);
        }
        else
        {
            _selection = ClampSelection(GetCreatingRect());
        }
    }

    private void ShowSelectorWindow()
    {
        if (_isWindowVisible)
        {
            return;
        }

        _isWindowVisible = true;
        ScreenBackground.Visibility = Visibility.Visible;

        var hwnd = WindowNative.GetWindowHandle(this);
        Win32Helper.MoveAndResizeTopmost(hwnd, _virtualBounds);
        AppWindow.Show(false);
        Win32Helper.ShowAndPinTopmost(hwnd);

        RootGrid.UpdateLayout();
        UpdateCanvasSize();
        UpdateSelectionCursor();
    }

    private void StopMouseHook()
    {
        _mouseHook?.Dispose();
        _mouseHook = null;
    }

    private void OnRootGridSizeChanged(object sender, SizeChangedEventArgs e)
    {
        UpdateCanvasSize();
    }

    private void UpdateCanvasSize()
    {
        if (RootGrid.ActualWidth <= 0 || RootGrid.ActualHeight <= 0)
        {
            return;
        }

        OverlayCanvas.Width = RootGrid.ActualWidth;
        OverlayCanvas.Height = RootGrid.ActualHeight;
        PositionHelpLabel();
    }

    private void InstallKeyboardHook()
    {
        _keyboardHook = new RegionSelectorKeyboardHook();
        _keyboardHook.EscapePressed += OnGlobalEscapePressed;
        _keyboardHook.EnterPressed += OnGlobalConfirmPressed;
        _keyboardHook.SpacePressed += OnGlobalSpacePressed;
        _keyboardHook.SpaceReleased += OnGlobalSpaceReleased;
    }

    private void OnGlobalSpacePressed()
    {
        RunOnUiThread(() =>
        {
            _spaceHeld = true;
            UpdateSelectionCursor();

            if (_mode == InteractionMode.Creating && !_awaitingFirstDrag)
            {
                EnsureSpaceMoveActive();
                UpdateCreatingSelection();
            }
        });
    }

    private void OnGlobalSpaceReleased()
    {
        RunOnUiThread(() =>
        {
            _spaceHeld = false;
            _spaceMoveActive = false;
            UpdateSelectionCursor();

            if (_mode == InteractionMode.Creating && !_awaitingFirstDrag)
            {
                ReanchorRubberBandForResize();
            }
        });
    }

    private void ReanchorRubberBandForResize()
    {
        var rect = GetEffectiveSelectionRect();
        if (!RegionSelectionMath.MeetsDragThreshold(rect))
        {
            return;
        }

        _selection = rect;

        var mouse = _currentPoint;
        var topLeft = new Windows.Foundation.Point(rect.Left, rect.Top);
        var topRight = new Windows.Foundation.Point(rect.Right, rect.Top);
        var bottomRight = new Windows.Foundation.Point(rect.Right, rect.Bottom);
        var bottomLeft = new Windows.Foundation.Point(rect.Left, rect.Bottom);

        var closestCorner = new[] { topLeft, topRight, bottomRight, bottomLeft }
            .OrderBy(corner => DistanceSquared(corner, mouse))
            .First();

        _startPoint = GetOppositeCorner(rect, closestCorner);
        _currentPoint = closestCorner;
    }

    private static double DistanceSquared(Windows.Foundation.Point a, Windows.Foundation.Point b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return (dx * dx) + (dy * dy);
    }

    private static Windows.Foundation.Point GetOppositeCorner(Rectangle rect, Windows.Foundation.Point corner)
    {
        var anchorLeft = Math.Abs(corner.X - rect.Left) <= Math.Abs(corner.X - rect.Right);
        var anchorTop = Math.Abs(corner.Y - rect.Top) <= Math.Abs(corner.Y - rect.Bottom);

        return new Windows.Foundation.Point(
            anchorLeft ? rect.Right : rect.Left,
            anchorTop ? rect.Bottom : rect.Top);
    }

    private void EnsureSpaceMoveActive()
    {
        if (_spaceMoveActive)
        {
            return;
        }

        BeginSpaceMove();
    }

    private void BeginSpaceMove()
    {
        var rect = GetEffectiveSelectionRect();
        if (!RegionSelectionMath.MeetsDragThreshold(rect))
        {
            return;
        }

        _spaceMoveActive = true;
        _spaceMoveWidth = rect.Width;
        _spaceMoveHeight = rect.Height;
        _selection = rect;
        _spaceMoveGrabOffset = new Windows.Foundation.Point(
            _currentPoint.X - rect.X,
            _currentPoint.Y - rect.Y);
    }

    private void ApplySpaceMove(Windows.Foundation.Point mouse)
    {
        if (!_spaceMoveActive)
        {
            return;
        }

        var moved = new Rectangle(
            (int)Math.Round(mouse.X - _spaceMoveGrabOffset.X),
            (int)Math.Round(mouse.Y - _spaceMoveGrabOffset.Y),
            _spaceMoveWidth,
            _spaceMoveHeight);

        _selection = ClampMove(moved);
    }

    private Rectangle GetEffectiveSelectionRect()
    {
        if (HasValidSelection(_selection))
        {
            return _selection;
        }

        return NormalizeRect(GetCreatingRect());
    }

    private static bool HasValidSelection(Rectangle rect) =>
        RegionSelectionMath.HasValidSelection(rect);

    private void UpdateSelectionCursor()
    {
        if (_hwnd == IntPtr.Zero)
        {
            return;
        }

        Win32Helper.ApplyWindowCursor(_hwnd, _spaceHeld && _mode == InteractionMode.Creating && !_awaitingFirstDrag);
    }

    private void OnGlobalEscapePressed()
    {
        RunOnUiThread(CancelSelection);
    }

    private void OnGlobalConfirmPressed()
    {
        RunOnUiThread(ConfirmCapture);
    }

    private Windows.Foundation.Point ScreenToLogical(int screenX, int screenY)
    {
        var (x, y) = RegionSelectionMath.ScreenToLogical(
            screenX,
            screenY,
            (int)Math.Max(1, OverlayCanvas.Width),
            (int)Math.Max(1, OverlayCanvas.Height),
            _virtualBounds);

        return new Windows.Foundation.Point(x, y);
    }

    private void OnClosed(object sender, WindowEventArgs e)
    {
        _keyboardHook?.Dispose();
        _keyboardHook = null;
        _mouseHook?.Dispose();
        _mouseHook = null;
    }

    private void RunOnUiThread(Action action)
    {
        if (_dispatcher?.HasThreadAccess == true)
        {
            action();
            return;
        }

        _dispatcher?.TryEnqueue(() => action());
    }

    private void PositionHelpLabel()
    {
        const double helpWidth = 360;
        const double helpHeight = 36;
        Canvas.SetLeft(HelpLabelHost, Math.Max(16, (OverlayCanvas.Width - helpWidth) / 2));
        Canvas.SetTop(HelpLabelHost, Math.Max(16, OverlayCanvas.Height - helpHeight - 24));
    }

    private void HideSelectionChrome()
    {
        SelectionBorder.Visibility = Visibility.Collapsed;
        SizeLabelHost.Visibility = Visibility.Collapsed;
        HelpLabelHost.Visibility = Visibility.Collapsed;
    }

    private void OnKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == Windows.System.VirtualKey.Escape)
        {
            e.Handled = true;
            CancelSelection();
            return;
        }

        if (e.Key is Windows.System.VirtualKey.Enter)
        {
            e.Handled = true;
            ConfirmCapture();
            return;
        }

        if (e.Key == Windows.System.VirtualKey.Space)
        {
            e.Handled = true;
            OnGlobalSpacePressed();
        }
    }

    private void OnKeyUp(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == Windows.System.VirtualKey.Space)
        {
            e.Handled = true;
            OnGlobalSpaceReleased();
        }
    }

    private void OnRightTapped(object sender, RightTappedRoutedEventArgs e)
    {
        CancelSelection();
    }

    private void OnPointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (_mode != InteractionMode.Listening || _hookDragging)
        {
            return;
        }

        BeginCreateDrag(e.GetCurrentPoint(RootGrid).Position, fromHook: false);
        RootGrid.CapturePointer(e.Pointer);
    }

    private void OnPointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (_mode != InteractionMode.Creating || _hookDragging)
        {
            return;
        }

        ContinueCreateDrag(e.GetCurrentPoint(RootGrid).Position);
    }

    private void OnPointerReleased(object sender, PointerRoutedEventArgs e)
    {
        if (_mode != InteractionMode.Creating || _hookDragging)
        {
            return;
        }

        RootGrid.ReleasePointerCapture(e.Pointer);
        EndCreateDrag(e.GetCurrentPoint(RootGrid).Position, fromHook: false);
    }

    private void MaybeBeginDragVisuals()
    {
        if (!_awaitingFirstDrag)
        {
            return;
        }

        var rect = GetCreatingRect();
        if (!RegionSelectionMath.MeetsDragThreshold(rect))
        {
            return;
        }

        _awaitingFirstDrag = false;
        SelectionBorder.Visibility = Visibility.Visible;
        SizeLabelHost.Visibility = Visibility.Visible;
        HelpLabelHost.Visibility = Visibility.Visible;
    }

    private void ConfirmCapture()
    {
        if (_isClosing)
        {
            return;
        }

        if (!HasValidSelection(_selection))
        {
            return;
        }

        RegionCaptured?.Invoke(this, ToScreenRect(_selection));
        ForceClose();
    }

    private void CancelSelection()
    {
        if (_isClosing)
        {
            return;
        }

        SelectionCancelled?.Invoke(this, EventArgs.Empty);
        ForceClose();
    }

    private void ForceClose()
    {
        if (_isClosing)
        {
            return;
        }

        _isClosing = true;
        _mode = InteractionMode.None;
        _hookDragging = false;
        _spaceHeld = false;
        _spaceMoveActive = false;
        StopMouseHook();
        _keyboardHook?.Dispose();
        _keyboardHook = null;
        Close();
    }

    private Rectangle GetCreatingRect() =>
        RegionSelectionMath.GetCreatingRect(_startPoint.X, _startPoint.Y, _currentPoint.X, _currentPoint.Y);

    private void UpdateSelectionVisuals(Rectangle selection)
    {
        Canvas.SetLeft(SelectionBorder, selection.X);
        Canvas.SetTop(SelectionBorder, selection.Y);
        SelectionBorder.Width = selection.Width;
        SelectionBorder.Height = selection.Height;

        SizeLabel.Text = $"{ToScreenSize(selection.Width, horizontal: true)} × {ToScreenSize(selection.Height, horizontal: false)}";
        Canvas.SetLeft(SizeLabelHost, selection.X);
        Canvas.SetTop(SizeLabelHost, Math.Max(0, selection.Y - 34));

        UpdateShades(selection);
    }

    private int ToScreenSize(int logicalSize, bool horizontal)
    {
        var canvasSize = horizontal
            ? Math.Max(1, OverlayCanvas.Width)
            : Math.Max(1, OverlayCanvas.Height);
        var screenSize = horizontal ? _virtualBounds.Width : _virtualBounds.Height;
        return Math.Max(1, (int)Math.Round(logicalSize / canvasSize * screenSize));
    }

    private void HideShades()
    {
        TopShade.Visibility = Visibility.Collapsed;
        BottomShade.Visibility = Visibility.Collapsed;
        LeftShade.Visibility = Visibility.Collapsed;
        RightShade.Visibility = Visibility.Collapsed;
    }

    private void ShowShades()
    {
        TopShade.Visibility = Visibility.Visible;
        BottomShade.Visibility = Visibility.Visible;
        LeftShade.Visibility = Visibility.Visible;
        RightShade.Visibility = Visibility.Visible;
    }

    private void UpdateShades(Rectangle selection)
    {
        if (_awaitingFirstDrag || _mode is InteractionMode.None or InteractionMode.Listening)
        {
            HideShades();
            return;
        }

        ShowShades();

        var totalWidth = OverlayCanvas.Width;
        var totalHeight = OverlayCanvas.Height;
        var left = Math.Clamp(selection.Left, 0, totalWidth);
        var top = Math.Clamp(selection.Top, 0, totalHeight);
        var right = Math.Clamp(selection.Right, 0, totalWidth);
        var bottom = Math.Clamp(selection.Bottom, 0, totalHeight);
        var height = Math.Max(0, bottom - top);

        TopShade.Width = totalWidth;
        TopShade.Height = top;
        Canvas.SetLeft(TopShade, 0);
        Canvas.SetTop(TopShade, 0);

        BottomShade.Width = totalWidth;
        BottomShade.Height = Math.Max(0, totalHeight - bottom);
        Canvas.SetLeft(BottomShade, 0);
        Canvas.SetTop(BottomShade, bottom);

        LeftShade.Width = left;
        LeftShade.Height = height;
        Canvas.SetLeft(LeftShade, 0);
        Canvas.SetTop(LeftShade, top);

        RightShade.Width = Math.Max(0, totalWidth - right);
        RightShade.Height = height;
        Canvas.SetLeft(RightShade, right);
        Canvas.SetTop(RightShade, top);
    }

    private Rectangle ClampSelection(Rectangle rect) =>
        RegionSelectionMath.ClampSelection(rect, (int)OverlayCanvas.Width, (int)OverlayCanvas.Height);

    private Rectangle ClampMove(Rectangle rect) =>
        RegionSelectionMath.ClampMove(rect, (int)OverlayCanvas.Width, (int)OverlayCanvas.Height);

    private static Rectangle NormalizeRect(Rectangle rect) => RegionSelectionMath.NormalizeRect(rect);

    private Rectangle ToScreenRect(Rectangle logicalSelection) =>
        RegionSelectionMath.ToScreenRect(
            logicalSelection,
            (int)Math.Max(1, OverlayCanvas.Width),
            (int)Math.Max(1, OverlayCanvas.Height),
            _virtualBounds);
}
