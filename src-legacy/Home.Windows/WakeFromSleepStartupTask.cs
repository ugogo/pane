using System.Diagnostics;

namespace Home.Windows;

internal static class WakeFromSleepStartupTask
{
    internal static Action<bool>? TestApplyOverride { get; set; }

    public static void Apply(string taskName, string executablePath, bool enabled)
    {
        if (TestApplyOverride is not null)
        {
            TestApplyOverride(enabled);
            return;
        }

        if (enabled)
        {
            Ensure(taskName, executablePath);
        }
        else
        {
            Remove(taskName);
        }
    }

    internal static void ResetForTests()
    {
        TestApplyOverride = null;
    }

    private static void Ensure(string taskName, string executablePath)
    {
        Remove(taskName);

        var taskXmlPath = Path.Combine(Path.GetTempPath(), $"home-wake-{Guid.NewGuid():N}.xml");
        try
        {
            File.WriteAllText(taskXmlPath, BuildWakeTaskXml(executablePath));

            var startInfo = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = $"/Create /F /TN \"{taskName}\" /XML \"{taskXmlPath}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = Process.Start(startInfo);
            process?.WaitForExit();
        }
        catch
        {
            // Wake task registration is best-effort.
        }
        finally
        {
            TryDeleteFile(taskXmlPath);
        }
    }

    private static void Remove(string taskName)
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = $"/Delete /F /TN \"{taskName}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = Process.Start(startInfo);
            process?.WaitForExit();
        }
        catch
        {
            // Wake task removal is best-effort.
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
