using System.IO;
using Microsoft.Win32;

namespace LightControls.Desktop.Startup;

public static class WindowsStartupManager
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "LightControls";

    public static bool IsEnabled => GetRegisteredPath() is not null;

    public static bool IsRegisteredFor(string executablePath) =>
        string.Equals(GetRegisteredPath(), NormalizePath(executablePath), StringComparison.OrdinalIgnoreCase);

    public static void Enable(string executablePath)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
            ?? throw new InvalidOperationException("Could not open the Windows startup registry key.");

        key.SetValue(ValueName, Quote(NormalizePath(executablePath)));
    }

    public static void Disable()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
        key?.DeleteValue(ValueName, throwOnMissingValue: false);
    }

    public static string? GetRegisteredPath()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath);
        var value = key?.GetValue(ValueName) as string;
        return string.IsNullOrWhiteSpace(value) ? null : Unquote(value.Trim());
    }

    private static string Quote(string path) =>
        path.Contains(' ') ? $"\"{path}\"" : path;

    private static string Unquote(string value)
    {
        if (value.Length >= 2 && value.StartsWith('"') && value.EndsWith('"'))
        {
            return value[1..^1];
        }

        return value;
    }

    private static string NormalizePath(string path) =>
        Path.GetFullPath(path);
}
