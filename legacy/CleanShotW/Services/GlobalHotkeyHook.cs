using System.Runtime.InteropServices;
using CleanShotW.Helpers;

namespace CleanShotW.Services;

internal sealed class GlobalHotkeyHook : IDisposable
{
    private const int WhKeyboardLl = 13;
    private const int WmKeydown = 0x0100;
    private const int WmSyskeydown = 0x0104;

    private const int VkControl = 0x11;
    private const int VkShift = 0x10;
    private const int VkMenu = 0x12;
    private const int VkLeftWindows = 0x5B;
    private const int VkRightWindows = 0x5C;

    private readonly IntPtr _hwnd;
    private readonly List<HotkeyBinding> _bindings = [];
    private HookProc? _hookProc;
    private IntPtr _hookHandle;
    private bool _isInstalled;

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

    public GlobalHotkeyHook(IntPtr hwnd)
    {
        _hwnd = hwnd;
    }

    public void SetBindings(IReadOnlyList<HotkeyBinding> bindings)
    {
        _bindings.Clear();
        _bindings.AddRange(bindings);

        if (_bindings.Count == 0)
        {
            Uninstall();
            return;
        }

        EnsureInstalled();
    }

    public void Clear()
    {
        _bindings.Clear();
        Uninstall();
    }

    private void EnsureInstalled()
    {
        if (_isInstalled)
        {
            return;
        }

        _hookProc = OnHook;
        _hookHandle = SetWindowsHookEx(WhKeyboardLl, _hookProc, GetModuleHandle(null), 0);
        _isInstalled = _hookHandle != IntPtr.Zero;

        if (!_isInstalled)
        {
            AppLog.Error("Failed to install global hotkey hook");
        }
    }

    private void Uninstall()
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

    private IntPtr OnHook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && (wParam == (IntPtr)WmKeydown || wParam == (IntPtr)WmSyskeydown))
        {
            var hookStruct = Marshal.PtrToStructure<KbdLlHookStruct>(lParam);
            var modifiers = ReadActiveModifiers();
            var virtualKey = hookStruct.VkCode;

            foreach (var binding in _bindings)
            {
                if (binding.Modifiers == modifiers && binding.VirtualKey == virtualKey)
                {
                    Win32Helper.PostHotkeyMessage(_hwnd, binding.Id);
                    break;
                }
            }
        }

        return CallNextHookEx(_hookHandle, nCode, wParam, lParam);
    }

    private static uint ReadActiveModifiers()
    {
        uint modifiers = 0;

        if (IsKeyPressed(VkControl))
        {
            modifiers |= Win32Helper.ModControl;
        }

        if (IsKeyPressed(VkShift))
        {
            modifiers |= Win32Helper.ModShift;
        }

        if (IsKeyPressed(VkMenu))
        {
            modifiers |= Win32Helper.ModAlt;
        }

        if (IsKeyPressed(VkLeftWindows) || IsKeyPressed(VkRightWindows))
        {
            modifiers |= Win32Helper.ModWin;
        }

        return modifiers;
    }

    private static bool IsKeyPressed(int virtualKey) => (GetAsyncKeyState(virtualKey) & 0x8000) != 0;

    public void Dispose()
    {
        Clear();
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int virtualKey);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);
}

internal readonly record struct HotkeyBinding(int Id, uint Modifiers, uint VirtualKey);
