using System.Runtime.InteropServices;

namespace CleanShot.WinUI.Services;

internal sealed class PreviewKeyboardHook : IDisposable
{
    private const int WhKeyboardLl = 13;
    private const int WmKeydown = 0x0100;
    private const int WmKeyup = 0x0101;
    private const int WmSyskeydown = 0x0104;
    private const int WmSyskeyup = 0x0105;
    private const int VkSpace = 0x20;

    private HookProc? _hookProc;
    private IntPtr _hookHandle;
    private bool _isInstalled;

    public event Action? SpacePressed;
    public event Action? SpaceReleased;

    private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KbdLlHookStruct
    {
        public uint VkCode;
        public uint ScanCode;
        public uint Flags;
        public uint Time;
        public IntPtr DwExtraInfo;
    }

    public PreviewKeyboardHook()
    {
        _hookProc = OnHook;
        _hookHandle = SetWindowsHookEx(WhKeyboardLl, _hookProc, GetModuleHandle(null), 0);
        _isInstalled = _hookHandle != IntPtr.Zero;

        if (!_isInstalled)
        {
            AppLog.Error("Failed to install preview keyboard hook");
        }
    }

    private IntPtr OnHook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            var hookStruct = Marshal.PtrToStructure<KbdLlHookStruct>(lParam);
            var message = wParam.ToInt32();
            var isKeyDown = message is WmKeydown or WmSyskeydown;

            switch (hookStruct.VkCode)
            {
                case VkSpace when isKeyDown:
                    SpacePressed?.Invoke();
                    break;
                case VkSpace when !isKeyDown:
                    SpaceReleased?.Invoke();
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
