using CleanShot.Core.Services;
using CleanShot.WinUI.Helpers;
using Home.Windows;

namespace CleanShot.Tests;

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
        HubStartupService.ResetForTests();
    }

    protected static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "CleanShot.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
