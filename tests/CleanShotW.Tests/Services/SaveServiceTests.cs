using System.Drawing;
using CleanShotW.Services;
using FluentAssertions;

namespace CleanShotW.Tests.Services;

public sealed class SaveServiceTests : TestBase
{
    [Fact]
    public void SaveBitmap_creates_png_in_configured_folder()
    {
        var tempDir = CreateTempDirectory();
        SaveService.SetSaveFolder(tempDir);
        using var bitmap = new Bitmap(16, 16);

        var savedPath = SaveService.SaveBitmap(bitmap);

        File.Exists(savedPath).Should().BeTrue();
        Path.GetDirectoryName(savedPath).Should().Be(tempDir);
        Path.GetFileName(savedPath).Should().StartWith("CleanShot ");
        Path.GetExtension(savedPath).Should().Be(".png");
    }

    [Fact]
    public void Initialize_ignores_blank_folder()
    {
        SaveService.Initialize("   ");

        SaveService.GetSaveFolder().Should().Be(AppSettingsService.DefaultSaveFolder);
    }

    [Fact]
    public void Initialize_applies_non_blank_folder()
    {
        var tempDir = CreateTempDirectory();

        SaveService.Initialize(tempDir);

        SaveService.GetSaveFolder().Should().Be(tempDir);
    }
}
