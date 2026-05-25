using LightControls.Core.Settings;
using LightControls.Core.Setup;
using LightControls.Tests.Fakes;
using static LightControls.Core.Setup.OpenRgbSetupManager;

namespace LightControls.Tests;

public sealed class OpenRgbSetupManagerTests
{
    [Fact]
    public async Task GetStatusAsync_ReturnsServerRunning_WhenBackendIsReachable()
    {
        var backend = new FakeRgbBackend { ServerReachable = true };
        var manager = new OpenRgbSetupManager(new LightControlsSettings(), backend);

        var status = await manager.GetStatusAsync();

        Assert.Equal(OpenRgbSetupState.ServerRunning, status.State);
    }

    [Fact]
    public async Task GetStatusAsync_ReturnsInstalledButStopped_WhenExecutableIsKnown()
    {
        var executable = CreateFakeExecutable();
        var backend = new FakeRgbBackend { ServerReachable = false };
        var manager = new OpenRgbSetupManager(
            new LightControlsSettings { OpenRgbExecutablePath = executable },
            backend);

        var status = await manager.GetStatusAsync();

        Assert.Equal(OpenRgbSetupState.InstalledButStopped, status.State);
        Assert.Equal(executable, status.ExecutablePath);
    }

    [Fact]
    public async Task EnsureServerRunningAsync_ReturnsLaunchFailed_WhenKnownExecutableCannotStart()
    {
        var executable = CreateFakeExecutable();
        var backend = new FakeRgbBackend { ServerReachable = false };
        var manager = new OpenRgbSetupManager(
            new LightControlsSettings { OpenRgbExecutablePath = executable },
            backend);

        var status = await manager.EnsureServerRunningAsync();

        Assert.Equal(OpenRgbSetupState.LaunchFailed, status.State);
    }

    [Fact]
    public void SelectWindowsPortableAsset_PrefersStandardWindows64Zip()
    {
        var releases = new List<CodebergRelease>
        {
            new([
                new CodebergReleaseAsset("OpenRGB_1.0rc2wr0_Windows_64_a589a0f.zip", "https://example.com/wr0.zip"),
                new CodebergReleaseAsset("OpenRGB_1.0rc2_Windows_64_0fca93e.zip", "https://example.com/standard.zip")
            ])
        };

        var asset = SelectWindowsPortableAsset(releases);

        Assert.NotNull(asset);
        Assert.Equal("https://example.com/standard.zip", asset.BrowserDownloadUrl);
    }

    [Fact]
    public void SelectWindowsPortableAsset_FallsBackToWinRing0Build_WhenStandardMissing()
    {
        var releases = new List<CodebergRelease>
        {
            new([
                new CodebergReleaseAsset("OpenRGB_1.0rc2wr0_Windows_64_a589a0f.zip", "https://example.com/wr0.zip")
            ])
        };

        var asset = SelectWindowsPortableAsset(releases);

        Assert.NotNull(asset);
        Assert.Equal("https://example.com/wr0.zip", asset.BrowserDownloadUrl);
    }

    [Fact]
    public void SelectWindowsPortableAsset_IgnoresWindows32Builds()
    {
        var releases = new List<CodebergRelease>
        {
            new([
                new CodebergReleaseAsset("OpenRGB_1.0rc2_Windows_32_0fca93e.zip", "https://example.com/win32.zip")
            ])
        };

        var asset = SelectWindowsPortableAsset(releases);

        Assert.Null(asset);
    }

    private static string CreateFakeExecutable()
    {
        var directory = Directory.CreateTempSubdirectory();
        var executable = Path.Combine(directory.FullName, "OpenRGB.exe");
        File.WriteAllText(executable, "not a real executable");
        return executable;
    }
}
