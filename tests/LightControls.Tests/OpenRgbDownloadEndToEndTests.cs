using LightControls.Core.Settings;
using LightControls.Core.Setup;
using LightControls.Tests.Fakes;

namespace LightControls.Tests;

public sealed class OpenRgbDownloadEndToEndTests
{
    [Fact]
    [Trait("Category", "Integration")]
    public async Task DownloadOpenRgbAsync_ExtractsOpenRgbExe()
    {
        var root = Path.Combine(Path.GetTempPath(), "light-controls-openrgb-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);

        try
        {
            Environment.SetEnvironmentVariable("LOCALAPPDATA", root);
            var settings = new LightControlsSettings();
            var manager = new OpenRgbSetupManager(settings, new FakeRgbBackend());

            var executable = await manager.DownloadOpenRgbAsync();

            Assert.NotNull(executable);
            Assert.True(File.Exists(executable));
            Assert.EndsWith("OpenRGB.exe", executable, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Environment.SetEnvironmentVariable("LOCALAPPDATA", null);
            try
            {
                Directory.Delete(root, recursive: true);
            }
            catch
            {
                // Temp cleanup is best effort on Windows when files are locked.
            }
        }
    }
}
