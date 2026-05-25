using CleanShotW.Helpers;
using Windows.System;
using Microsoft.UI.Input;
using Windows.UI.Core;

namespace CleanShotW.Services;

internal static class HotkeyParser
{
    private static readonly Dictionary<string, uint> ModifierMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Ctrl"] = Win32Helper.ModControl,
        ["Control"] = Win32Helper.ModControl,
        ["Shift"] = Win32Helper.ModShift,
        ["Alt"] = Win32Helper.ModAlt,
        ["Win"] = Win32Helper.ModWin,
        ["Windows"] = Win32Helper.ModWin,
    };

    public static bool TryParse(string text, out uint modifiers, out uint virtualKey, out string error)
    {
        modifiers = 0;
        virtualKey = 0;
        error = string.Empty;

        var parts = text
            .Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .ToArray();

        if (parts.Length < 2)
        {
            error = "Use at least one modifier and a key (e.g. Ctrl+Shift+3).";
            return false;
        }

        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (!ModifierMap.TryGetValue(parts[i], out var modifier))
            {
                error = $"Unknown modifier \"{parts[i]}\".";
                return false;
            }

            modifiers |= modifier;
        }

        if (modifiers == 0)
        {
            error = "At least one modifier is required.";
            return false;
        }

        var keyPart = parts[^1];
        if (keyPart.Length == 1)
        {
            var ch = char.ToUpperInvariant(keyPart[0]);
            if (ch is >= '0' and <= '9')
            {
                virtualKey = (uint)ch;
                return true;
            }

            if (ch is >= 'A' and <= 'Z')
            {
                virtualKey = ch;
                return true;
            }
        }

        error = $"Unsupported key \"{keyPart}\".";
        return false;
    }

    public static string Format(uint modifiers, uint virtualKey)
    {
        var parts = new List<string>(4);

        if ((modifiers & Win32Helper.ModControl) != 0)
        {
            parts.Add("Ctrl");
        }

        if ((modifiers & Win32Helper.ModShift) != 0)
        {
            parts.Add("Shift");
        }

        if ((modifiers & Win32Helper.ModAlt) != 0)
        {
            parts.Add("Alt");
        }

        if ((modifiers & Win32Helper.ModWin) != 0)
        {
            parts.Add("Win");
        }

        parts.Add(FormatKey(virtualKey));
        return string.Join('+', parts);
    }

    private static string FormatKey(uint virtualKey)
    {
        if (virtualKey is >= 0x30 and <= 0x39)
        {
            return ((char)virtualKey).ToString();
        }

        if (virtualKey is >= 0x41 and <= 0x5A)
        {
            return ((char)virtualKey).ToString();
        }

        return $"0x{virtualKey:X}";
    }

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
            modifiers |= Win32Helper.ModControl;
        }

        if (IsKeyDown(VirtualKey.Shift))
        {
            modifiers |= Win32Helper.ModShift;
        }

        if (IsKeyDown(VirtualKey.Menu))
        {
            modifiers |= Win32Helper.ModAlt;
        }

        if (IsKeyDown(VirtualKey.LeftWindows) || IsKeyDown(VirtualKey.RightWindows))
        {
            modifiers |= Win32Helper.ModWin;
        }

        return modifiers;
    }

    public static string FormatModifiers(uint modifiers)
    {
        var parts = new List<string>(4);

        if ((modifiers & Win32Helper.ModControl) != 0)
        {
            parts.Add("Ctrl");
        }

        if ((modifiers & Win32Helper.ModShift) != 0)
        {
            parts.Add("Shift");
        }

        if ((modifiers & Win32Helper.ModAlt) != 0)
        {
            parts.Add("Alt");
        }

        if ((modifiers & Win32Helper.ModWin) != 0)
        {
            parts.Add("Win");
        }

        return string.Join('+', parts);
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

    private static bool IsKeyDown(VirtualKey key)
    {
        return InputKeyboardSource.GetKeyStateForCurrentThread(key)
            .HasFlag(CoreVirtualKeyStates.Down);
    }

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
