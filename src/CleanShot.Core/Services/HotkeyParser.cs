using CleanShot.Core.Interop;

namespace CleanShot.Core.Services;

internal static class HotkeyParser
{
    private static readonly Dictionary<string, uint> ModifierMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Ctrl"] = Win32Interop.ModControl,
        ["Control"] = Win32Interop.ModControl,
        ["Shift"] = Win32Interop.ModShift,
        ["Alt"] = Win32Interop.ModAlt,
        ["Win"] = Win32Interop.ModWin,
        ["Windows"] = Win32Interop.ModWin,
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

        if ((modifiers & Win32Interop.ModControl) != 0)
        {
            parts.Add("Ctrl");
        }

        if ((modifiers & Win32Interop.ModShift) != 0)
        {
            parts.Add("Shift");
        }

        if ((modifiers & Win32Interop.ModAlt) != 0)
        {
            parts.Add("Alt");
        }

        if ((modifiers & Win32Interop.ModWin) != 0)
        {
            parts.Add("Win");
        }

        parts.Add(FormatKey(virtualKey));
        return string.Join('+', parts);
    }

    public static string FormatModifiers(uint modifiers)
    {
        var parts = new List<string>(4);

        if ((modifiers & Win32Interop.ModControl) != 0)
        {
            parts.Add("Ctrl");
        }

        if ((modifiers & Win32Interop.ModShift) != 0)
        {
            parts.Add("Shift");
        }

        if ((modifiers & Win32Interop.ModAlt) != 0)
        {
            parts.Add("Alt");
        }

        if ((modifiers & Win32Interop.ModWin) != 0)
        {
            parts.Add("Win");
        }

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
}
