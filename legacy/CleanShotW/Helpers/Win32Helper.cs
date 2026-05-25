using System.Drawing;
using System.Runtime.InteropServices;
using CleanShotW.Services;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;
using Windows.Storage.Streams;

namespace CleanShotW.Helpers;

internal static class Win32Helper
{
    public const int SmXVirtualScreen = Win32Interop.SmXVirtualScreen;
    public const int SmYVirtualScreen = Win32Interop.SmYVirtualScreen;
    public const int SmCxVirtualScreen = Win32Interop.SmCxVirtualScreen;
    public const int SmCyVirtualScreen = Win32Interop.SmCyVirtualScreen;

    public const int WmHotkey = Win32Interop.WmHotkey;
    public const int WmPowerBroadcast = 0x0218;
    public const int PbtApmResumeAutomatic = 0x0012;
    public const int PbtApmResumeSuspend = 0x0007;
    public const uint ModAlt = Win32Interop.ModAlt;
    public const uint ModControl = Win32Interop.ModControl;
    public const uint ModShift = Win32Interop.ModShift;
    public const uint ModWin = Win32Interop.ModWin;
    public const uint Vk3 = Win32Interop.Vk3;
    public const uint Vk4 = Win32Interop.Vk4;

    public const int GwlExstyle = -20;
    public const int WsExToolwindow = 0x00000080;
    public const int WsExNoactivate = 0x08000000;
    public const int SwpNomove = 0x0002;
    public const int SwpNosize = 0x0001;
    public const int SwpNoactivate = 0x0010;
    public const int SwpShowwindow = 0x0040;
    public const int SwShow = 5;
    public const int SwShowNa = 8;
    public static readonly IntPtr HwndTopmost = new(-1);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int index);

    public static bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk) =>
        Win32Interop.RegisterHotKey(hWnd, id, fsModifiers, vk);

    public static bool UnregisterHotKey(IntPtr hWnd, int id) =>
        Win32Interop.UnregisterHotKey(hWnd, id);

    public static void PostHotkeyMessage(IntPtr hwnd, int hotkeyId) =>
        Win32Interop.PostHotkeyMessage(hwnd, hotkeyId);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int x,
        int y,
        int cx,
        int cy,
        uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public static Rectangle GetVirtualScreenBounds() =>
        Win32Interop.GetVirtualScreenBounds();

    public static void MakeToolWindow(IntPtr hwnd)
    {
        var style = GetWindowLong(hwnd, GwlExstyle);
        SetWindowLong(hwnd, GwlExstyle, style | WsExToolwindow | WsExNoactivate);
    }

    public static void MakeOverlayWindow(IntPtr hwnd)
    {
        var style = GetWindowLong(hwnd, GwlExstyle);
        SetWindowLong(hwnd, GwlExstyle, (style | WsExToolwindow) & ~WsExNoactivate);
    }

    public static void MoveAndResizeTopmost(IntPtr hwnd, Rectangle bounds)
    {
        SetWindowPos(
            hwnd,
            HwndTopmost,
            bounds.X,
            bounds.Y,
            bounds.Width,
            bounds.Height,
            SwpShowwindow);
    }

    public static void MoveAndResizeHidden(IntPtr hwnd, Rectangle bounds)
    {
        const int swpHideWindow = 0x0080;
        SetWindowPos(
            hwnd,
            HwndTopmost,
            bounds.X,
            bounds.Y,
            bounds.Width,
            bounds.Height,
            SwpNoactivate | swpHideWindow);
    }

    public static void ShowAndPinTopmost(IntPtr hwnd)
    {
        ShowWindow(hwnd, SwShow);
        PinTopmost(hwnd);
    }

    public static void ShowTopmostNoActivate(IntPtr hwnd)
    {
        ShowWindow(hwnd, SwShowNa);
        PinTopmost(hwnd);
    }

    public static void PinTopmost(IntPtr hwnd)
    {
        SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0, SwpNomove | SwpNosize | SwpNoactivate | SwpShowwindow);
    }

    private const int IdcCross = 32515;
    private const int IdcSizeAll = 32646;

    private static readonly IntPtr CrosshairCursor = LoadCursor(IntPtr.Zero, IdcCross);
    private static readonly IntPtr MoveCursor = LoadCursor(IntPtr.Zero, IdcSizeAll);

    public static void ApplyWindowCursor(IntPtr hwnd, bool moveMode)
    {
        var cursor = moveMode ? MoveCursor : CrosshairCursor;
        SetClassLong(hwnd, GclHcursor, cursor);
        SetCursor(cursor);
    }

    private const int GclHcursor = -12;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetClassLong(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    public static void ApplySelectionCursor(bool moveMode)
    {
        SetCursor(moveMode ? MoveCursor : CrosshairCursor);
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr LoadCursor(IntPtr hInstance, int lpCursorName);

    [DllImport("user32.dll")]
    private static extern IntPtr SetCursor(IntPtr hCursor);

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out Point lpPoint);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out Rect lpRect);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool AllowSetForegroundWindow(int dwProcessId);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static bool IsCurrentProcessWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
        {
            return false;
        }

        _ = GetWindowThreadProcessId(hwnd, out var processId);
        return processId == (uint)Environment.ProcessId;
    }

    public static string DescribeWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
        {
            return "hwnd=null";
        }

        var title = GetWindowTitle(hwnd);
        var processName = GetWindowProcessName(hwnd);
        var owner = IsCurrentProcessWindow(hwnd) ? "ours" : "external";
        return $"hwnd=0x{hwnd.ToInt64():X} process={processName} title=\"{title}\" ({owner})";
    }

    public static string DescribeForegroundWindow()
    {
        return DescribeWindow(GetForegroundWindow());
    }

    private static string GetWindowTitle(IntPtr hwnd)
    {
        var length = GetWindowTextLength(hwnd);
        if (length <= 0)
        {
            return string.Empty;
        }

        var builder = new System.Text.StringBuilder(length + 1);
        _ = GetWindowText(hwnd, builder, builder.Capacity);
        return builder.ToString();
    }

    private static string GetWindowProcessName(IntPtr hwnd)
    {
        _ = GetWindowThreadProcessId(hwnd, out var processId);
        if (processId == 0)
        {
            return "unknown";
        }

        try
        {
            return System.Diagnostics.Process.GetProcessById((int)processId).ProcessName;
        }
        catch
        {
            return $"pid:{processId}";
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    public static bool TryRestoreForegroundWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !IsWindow(hwnd) || !IsWindowVisible(hwnd))
        {
            AppLog.Info($"Focus restore skipped: target invalid ({DescribeWindow(hwnd)})");
            return false;
        }

        AllowSetForegroundWindow(-1);
        var restored = SetForegroundWindow(hwnd);
        AppLog.Info(restored
            ? $"Focus restore succeeded -> {DescribeWindow(hwnd)}; foreground now {DescribeForegroundWindow()}"
            : $"Focus restore failed -> {DescribeWindow(hwnd)}; foreground still {DescribeForegroundWindow()}");
        return restored;
    }

    public static bool IsCursorOverWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
        {
            return false;
        }

        if (!GetCursorPos(out var cursor) || !GetWindowRect(hwnd, out var bounds))
        {
            return false;
        }

        return cursor.X >= bounds.Left &&
               cursor.X < bounds.Right &&
               cursor.Y >= bounds.Top &&
               cursor.Y < bounds.Bottom;
    }

    public static bool TryGetWindowScreenBounds(IntPtr hwnd, out Rectangle bounds)
    {
        bounds = Rectangle.Empty;
        if (hwnd == IntPtr.Zero || !GetWindowRect(hwnd, out var rect))
        {
            return false;
        }

        bounds = new Rectangle(rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top);
        return bounds.Width > 0 && bounds.Height > 0;
    }

    public static IntPtr WindowFromScreenPoint(int x, int y)
    {
        return WindowFromPoint(new Point { X = x, Y = y });
    }

    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(Point point);
}

internal static class BitmapHelper
{
    public static async Task<BitmapImage> ToBitmapImageAsync(Bitmap bitmap)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"cleanshot-preview-{Guid.NewGuid():N}.png");
        bitmap.Save(tempPath, System.Drawing.Imaging.ImageFormat.Png);

        var file = await StorageFile.GetFileFromPathAsync(tempPath);
        using IRandomAccessStream stream = await file.OpenAsync(FileAccessMode.Read);

        var image = new BitmapImage();
        await image.SetSourceAsync(stream);

        try
        {
            File.Delete(tempPath);
        }
        catch
        {
            // Temp file cleanup is best-effort.
        }

        return image;
    }

    public static async Task<global::Windows.Storage.Streams.IRandomAccessStream> ToPngStreamAsync(Bitmap bitmap)
    {
        using var stream = new MemoryStream();
        bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
        var randomAccessStream = new global::Windows.Storage.Streams.InMemoryRandomAccessStream();
        await randomAccessStream.WriteAsync(stream.ToArray().AsBuffer());
        randomAccessStream.Seek(0);
        return randomAccessStream;
    }
}

internal static class BufferExtensions
{
    public static global::Windows.Storage.Streams.IBuffer AsBuffer(this byte[] bytes)
    {
        return global::Windows.Security.Cryptography.CryptographicBuffer.CreateFromByteArray(bytes);
    }
}
