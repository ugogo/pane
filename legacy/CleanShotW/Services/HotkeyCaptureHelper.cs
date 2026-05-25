using Microsoft.UI.Input;
using Windows.System;
using Windows.UI.Core;

namespace CleanShotW.Services;

internal static class HotkeyCaptureHelper
{
    public static bool IsModifierKey(VirtualKey key) =>
        key is VirtualKey.Shift
            or VirtualKey.LeftShift
            or VirtualKey.RightShift
            or VirtualKey.Control
            or VirtualKey.LeftControl
            or VirtualKey.RightControl
            or VirtualKey.Menu
            or VirtualKey.LeftMenu
            or VirtualKey.RightMenu
            or VirtualKey.LeftWindows
            or VirtualKey.RightWindows;

    public static uint ReadActiveModifiers()
    {
        uint modifiers = 0;

        if (IsKeyDown(VirtualKey.Control))
        {
            modifiers |= Win32Interop.ModControl;
        }

        if (IsKeyDown(VirtualKey.Shift))
        {
            modifiers |= Win32Interop.ModShift;
        }

        if (IsKeyDown(VirtualKey.Menu))
        {
            modifiers |= Win32Interop.ModAlt;
        }

        if (IsKeyDown(VirtualKey.LeftWindows) || IsKeyDown(VirtualKey.RightWindows))
        {
            modifiers |= Win32Interop.ModWin;
        }

        return modifiers;
    }

    public static bool TryCapture(VirtualKey key, out uint modifiers, out uint virtualKey, out string error)
    {
        modifiers = ReadActiveModifiers();
        virtualKey = 0;
        error = string.Empty;

        if (modifiers == 0)
        {
            error = "Add Ctrl, Shift, Alt, or Win";
            return false;
        }

        if (!TryVirtualKeyToVk(key, out virtualKey))
        {
            error = "Use a letter or number key";
            return false;
        }

        return true;
    }

    private static bool IsKeyDown(VirtualKey key) =>
        InputKeyboardSource.GetKeyStateForCurrentThread(key)
            .HasFlag(CoreVirtualKeyStates.Down);

    private static bool TryVirtualKeyToVk(VirtualKey key, out uint virtualKey)
    {
        if (key is >= VirtualKey.Number0 and <= VirtualKey.Number9)
        {
            virtualKey = (uint)('0' + (key - VirtualKey.Number0));
            return true;
        }

        if (key is >= VirtualKey.A and <= VirtualKey.Z)
        {
            virtualKey = (uint)key;
            return true;
        }

        virtualKey = 0;
        return false;
    }
}
