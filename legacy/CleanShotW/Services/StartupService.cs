using System.Diagnostics;
using Microsoft.Win32;

namespace CleanShotW.Services;

internal static class StartupService
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValueName = "CleanShot W";
    private const string WakeTaskName = "CleanShot W Wake";

    internal static string? TestExecutablePathOverride { get; set; }

    internal static Action<bool>? TestApplyRunKeyOverride { get; set; }

    internal static Action<bool>? TestApplyWakeTaskOverride { get; set; }

    public static void Apply(bool enabled)
    {
        if (TestApplyRunKeyOverride is not null || TestApplyWakeTaskOverride is not null)
        {
            TestApplyRunKeyOverride?.Invoke(enabled);
            TestApplyWakeTaskOverride?.Invoke(enabled);
            return;
        }

        if (enabled)
        {
            Enable();
        }
        else
        {
            Disable();
        }
    }

    public static bool IsEnabledInOs()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
        return key?.GetValue(RunValueName) is string;
    }

    internal static void ResetForTests()
    {
        TestExecutablePathOverride = null;
        TestApplyRunKeyOverride = null;
        TestApplyWakeTaskOverride = null;
    }

    private static void Enable()
    {
        var executablePath = ResolveExecutablePath();
        SetRunKey(executablePath);
        EnsureWakeTask(executablePath);
    }

    private static void Disable()
    {
        RemoveRunKey();
        RemoveWakeTask();
    }

    private static void SetRunKey(string executablePath)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true);
        key.SetValue(RunValueName, Quote(executablePath));
        AppLog.Info($"Registered login startup: {executablePath}");
    }

    private static void RemoveRunKey()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
        key?.DeleteValue(RunValueName, throwOnMissingValue: false);
        AppLog.Info("Removed login startup registration");
    }

    private static void EnsureWakeTask(string executablePath)
    {
        RemoveWakeTask();

        var taskXmlPath = Path.Combine(Path.GetTempPath(), $"cleanshot-w-wake-{Guid.NewGuid():N}.xml");
        try
        {
            File.WriteAllText(taskXmlPath, BuildWakeTaskXml(executablePath));

            var startInfo = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = $"/Create /F /TN \"{WakeTaskName}\" /XML \"{taskXmlPath}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = Process.Start(startInfo);
            process?.WaitForExit();

            if (process?.ExitCode == 0)
            {
                AppLog.Info("Registered wake-from-sleep startup task");
                return;
            }

            AppLog.Error($"Failed to register wake startup task (exit code {process?.ExitCode})");
        }
        catch (Exception ex)
        {
            AppLog.Error(ex);
        }
        finally
        {
            TryDeleteFile(taskXmlPath);
        }
    }

    private static void RemoveWakeTask()
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = $"/Delete /F /TN \"{WakeTaskName}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = Process.Start(startInfo);
            process?.WaitForExit();
        }
        catch (Exception ex)
        {
            AppLog.Error(ex);
        }
    }

    private static string BuildWakeTaskXml(string executablePath)
    {
        var command = EscapeXml(executablePath);
        const string wakeQuery =
            "*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and (EventID=107 or EventID=1)]]";

        return $"""
            <?xml version="1.0" encoding="UTF-16"?>
            <Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
              <Triggers>
                <EventTrigger>
                  <Enabled>true</Enabled>
                  <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="System"&gt;&lt;Select Path="System"&gt;{wakeQuery}&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
                </EventTrigger>
              </Triggers>
              <Principals>
                <Principal id="Author">
                  <LogonType>InteractiveToken</LogonType>
                  <RunLevel>LeastPrivilege</RunLevel>
                </Principal>
              </Principals>
              <Settings>
                <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
                <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
                <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
                <AllowHardTerminate>true</AllowHardTerminate>
                <StartWhenAvailable>true</StartWhenAvailable>
                <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
                <Enabled>true</Enabled>
              </Settings>
              <Actions Context="Author">
                <Exec>
                  <Command>{command}</Command>
                </Exec>
              </Actions>
            </Task>
            """;
    }

    private static string ResolveExecutablePath()
    {
        var path = TestExecutablePathOverride ?? Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("Cannot resolve CleanShot W executable path.");
        }

        return path;
    }

    private static string Quote(string value) => $"\"{value}\"";

    private static string EscapeXml(string value) =>
        value
            .Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal)
            .Replace("'", "&apos;", StringComparison.Ordinal);

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // Temp file cleanup is best-effort.
        }
    }
}
