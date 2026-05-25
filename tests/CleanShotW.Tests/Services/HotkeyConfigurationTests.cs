using CleanShotW.Helpers;
using CleanShot.Core.Services;
using FluentAssertions;

namespace CleanShotW.Tests.Services;

public sealed class HotkeyConfigurationTests : TestBase
{
    [Fact]
    public void Defaults_match_expected_shortcuts()
    {
        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Shift+3");
        HotkeyConfiguration.RegionDisplay.Should().Be("Ctrl+Shift+4");
    }

    [Fact]
    public void SetFullScreen_updates_display_without_affecting_region()
    {
        HotkeyConfiguration.SetFullScreen(Win32Helper.ModControl | Win32Helper.ModAlt, (uint)'A');

        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Alt+A");
        HotkeyConfiguration.RegionDisplay.Should().Be("Ctrl+Shift+4");
    }

    [Fact]
    public void SetRegion_updates_display_without_affecting_full_screen()
    {
        HotkeyConfiguration.SetRegion(Win32Helper.ModWin, (uint)'Z');

        HotkeyConfiguration.RegionDisplay.Should().Be("Win+Z");
        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Shift+3");
    }

    [Fact]
    public void ResetToDefaults_restores_initial_values()
    {
        HotkeyConfiguration.SetFullScreen(Win32Helper.ModAlt, (uint)'B');
        HotkeyConfiguration.SetRegion(Win32Helper.ModAlt, (uint)'C');

        HotkeyConfiguration.ResetToDefaults();

        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Shift+3");
        HotkeyConfiguration.RegionDisplay.Should().Be("Ctrl+Shift+4");
    }
}
