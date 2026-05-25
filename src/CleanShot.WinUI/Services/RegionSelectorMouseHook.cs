using System.Runtime.InteropServices;
using CleanShot.WinUI.Helpers;

namespace CleanShot.WinUI.Services;

internal sealed class RegionSelectorMouseHook : IDisposable
{
    private const int WhMouseLl = 14;
    private const int WmLbuttondown = 0x0201;
    private const int WmLbuttonup = 0x0202;
    private const int WmMousemove = 0x0200;

    private HookProc? _hookProc;
    private IntPtr _hookHandle;
    private bool _isInstalled;
    private bool _leftButtonDown;

    public Func<bool>? IsMoveMode { get; set; }

    public event Action<int, int>? LeftButtonPressed;
    public event Action<int, int>? LeftButtonDragged;
    public event Action<int, int>? LeftButtonReleased;

    private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MsLlHookStruct
    {
        public Point Pt;
        public uint MouseData;
        public uint Flags;
        public uint Time;
        public IntPtr DwExtraInfo;
    }

    public RegionSelectorMouseHook()
    {
        _hookProc = OnHook;
        _hookHandle = SetWindowsHookEx(WhMouseLl, _hookProc, GetModuleHandle(null), 0);
        _isInstalled = _hookHandle != IntPtr.Zero;

        if (!_isInstalled)
        {
            AppLog.Error("Failed to install region selector mouse hook");
        }
    }

    private IntPtr OnHook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            Win32Helper.ApplySelectionCursor(IsMoveMode?.Invoke() == true);

            var hookStruct = Marshal.PtrToStructure<MsLlHookStruct>(lParam);
            var message = wParam.ToInt32();

            switch (message)
            {
                case WmLbuttondown:
                    _leftButtonDown = true;
                    LeftButtonPressed?.Invoke(hookStruct.Pt.X, hookStruct.Pt.Y);
                    break;
                case WmMousemove:
                    if (_leftButtonDown)
                    {
                        LeftButtonDragged?.Invoke(hookStruct.Pt.X, hookStruct.Pt.Y);
                    }

                    break;
                case WmLbuttonup:
                    if (_leftButtonDown)
                    {
                        _leftButtonDown = false;
                        LeftButtonReleased?.Invoke(hookStruct.Pt.X, hookStruct.Pt.Y);
                    }

                    break;
            }
        }

        return CallNextHookEx(_hookHandle, nCode, wParam, lParam);
    }

    public void Dispose()
    {
        if (!_isInstalled)
        {
            return;
        }

        UnhookWindowsHookEx(_hookHandle);
        _hookHandle = IntPtr.Zero;
        _hookProc = null;
        _isInstalled = false;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);
}
