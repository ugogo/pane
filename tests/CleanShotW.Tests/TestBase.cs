using CleanShotW.Helpers;
using CleanShotW.Services;

namespace CleanShotW.Tests;

public abstract class TestBase : IDisposable
{
    protected TestBase()
    {
        ResetState();
    }

    public void Dispose()
    {
        ResetState();
        GC.SuppressFinalize(this);
    }

    protected static void ResetState()
    {
        AppSettingsService.ResetForTests();
        SaveService.ResetForTests();
        StartupService.ResetForTests();
        SingleInstanceService.ResetForTests();
    }

    protected static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "CleanShotW.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
