using Microsoft.Win32;

namespace Home.Windows;

public static class WindowsStartupRegistry
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";

    public static bool IsEnabled(string valueName) => GetRegisteredPath(valueName) is not null;

    public static bool IsRegisteredFor(string valueName, string executablePath) =>
        string.Equals(GetRegisteredPath(valueName), NormalizePath(executablePath), StringComparison.OrdinalIgnoreCase);

    public static void Enable(string valueName, string executablePath)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true)
            ?? throw new InvalidOperationException("Could not open the Windows startup registry key.");

        key.SetValue(valueName, Quote(NormalizePath(executablePath)));
    }

    public static void Disable(string valueName)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
        key?.DeleteValue(valueName, throwOnMissingValue: false);
    }

    public static string? GetRegisteredPath(string valueName)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath);
        var value = key?.GetValue(valueName) as string;
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
