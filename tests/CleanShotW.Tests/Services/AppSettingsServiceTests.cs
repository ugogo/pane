using System.Drawing;
using System.Text.Json;
using CleanShotW.Helpers;
using CleanShot.Core.Services;
using FluentAssertions;

namespace CleanShotW.Tests.Services;

public sealed class AppSettingsServiceTests : TestBase
{
    [Fact]
    public void LoadSettings_without_file_keeps_defaults()
    {
        var tempDir = CreateTempDirectory();
        AppSettingsService.TestSettingsPathOverride = Path.Combine(tempDir, "settings.json");

        AppSettingsService.LoadSettings();

        AppSettingsService.SaveFolder.Should().Be(AppSettingsService.DefaultSaveFolder);
        AppSettingsService.LaunchAtStartup.Should().BeTrue();
        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Shift+3");
        HotkeyConfiguration.RegionDisplay.Should().Be("Ctrl+Shift+4");
    }

    [Fact]
    public void LoadSettings_applies_valid_settings_document()
    {
        var tempDir = CreateTempDirectory();
        var settingsPath = Path.Combine(tempDir, "settings.json");
        var saveFolder = Path.Combine(tempDir, "captures");
        var json = JsonSerializer.Serialize(new
        {
            FullScreenShortcut = "Ctrl+Alt+1",
            RegionShortcut = "Ctrl+Alt+2",
            SaveFolder = saveFolder,
        });
        File.WriteAllText(settingsPath, json);
        AppSettingsService.TestSettingsPathOverride = settingsPath;

        AppSettingsService.LoadSettings();

        AppSettingsService.SaveFolder.Should().Be(saveFolder);
        AppSettingsService.LaunchAtStartup.Should().BeTrue();
        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Alt+1");
        HotkeyConfiguration.RegionDisplay.Should().Be("Ctrl+Alt+2");
    }

    [Fact]
    public void LoadSettings_ignores_invalid_hotkeys()
    {
        var tempDir = CreateTempDirectory();
        var settingsPath = Path.Combine(tempDir, "settings.json");
        File.WriteAllText(settingsPath, """{"FullScreenShortcut":"NotAHotkey","RegionShortcut":"Ctrl+Shift+4"}""");
        AppSettingsService.TestSettingsPathOverride = settingsPath;

        AppSettingsService.LoadSettings();

        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Shift+3");
        HotkeyConfiguration.RegionDisplay.Should().Be("Ctrl+Shift+4");
    }

    [Fact]
    public void LoadSettings_ignores_blank_save_folder()
    {
        var tempDir = CreateTempDirectory();
        var settingsPath = Path.Combine(tempDir, "settings.json");
        File.WriteAllText(settingsPath, """{"SaveFolder":"   "}""");
        AppSettingsService.TestSettingsPathOverride = settingsPath;

        AppSettingsService.LoadSettings();

        AppSettingsService.SaveFolder.Should().Be(AppSettingsService.DefaultSaveFolder);
    }

    [Fact]
    public void SaveSettings_round_trips_values()
    {
        var tempDir = CreateTempDirectory();
        var settingsPath = Path.Combine(tempDir, "settings.json");
        AppSettingsService.TestSettingsPathOverride = settingsPath;
        var saveFolder = Path.Combine(tempDir, "saved");
        HotkeyConfiguration.SetFullScreen(Win32Helper.ModControl | Win32Helper.ModAlt, (uint)'Q');
        HotkeyConfiguration.SetRegion(Win32Helper.ModControl | Win32Helper.ModAlt, (uint)'W');
        AppSettingsService.SetSaveFolder(saveFolder);
        AppSettingsService.SetLaunchAtStartup(false);

        AppSettingsService.SaveSettings();
        HotkeyConfiguration.ResetToDefaults();
        AppSettingsService.SetSaveFolder(AppSettingsService.DefaultSaveFolder);
        AppSettingsService.SetLaunchAtStartup(true);
        AppSettingsService.LoadSettings();

        AppSettingsService.SaveFolder.Should().Be(saveFolder);
        AppSettingsService.LaunchAtStartup.Should().BeFalse();
        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Alt+Q");
        HotkeyConfiguration.RegionDisplay.Should().Be("Ctrl+Alt+W");
    }
}
