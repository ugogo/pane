using System.Diagnostics;

namespace Home.Windows;

public static class StandaloneLauncher
{
    public static int Run(string moduleId)
    {
        if (HubProcessGate.TryRedirectToHub())
        {
            return 0;
        }

        var hubExe = FindHomeHubExecutable();
        if (hubExe is null)
        {
            Console.Error.WriteLine("Home.Hub.exe was not found. Build the hub app first.");
            return 1;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = hubExe,
            Arguments = $"--module {moduleId}",
            UseShellExecute = true,
        });

        return 0;
    }

    private static string? FindHomeHubExecutable()
    {
        var local = Path.Combine(AppContext.BaseDirectory, "Home.Hub.exe");
        if (File.Exists(local))
        {
            return local;
        }

        var repoRoot = LocateRepoRoot(AppContext.BaseDirectory);
        if (repoRoot is null)
        {
            return null;
        }

        var devPath = Path.Combine(
            repoRoot,
            "src",
            "Home.Hub",
            "bin",
            "x64",
            "Release",
            "net10.0-windows10.0.19041.0",
            "Home.Hub.exe");

        return File.Exists(devPath) ? devPath : null;
    }

    private static string? LocateRepoRoot(string startDirectory)
    {
        var current = new DirectoryInfo(startDirectory);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "Home.slnx")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return null;
    }
}
