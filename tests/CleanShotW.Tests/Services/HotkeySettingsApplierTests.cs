using CleanShotW.Services;
using FluentAssertions;

namespace CleanShotW.Tests.Services;

public sealed class HotkeySettingsApplierTests : TestBase
{
    [Fact]
    public void TryApply_updates_configuration_and_invokes_callback()
    {
        var tempDir = CreateTempDirectory();
        AppSettingsService.TestSettingsPathOverride = Path.Combine(tempDir, "settings.json");
        var callbackInvoked = false;

        var applied = HotkeySettingsApplier.TryApply(
            "Ctrl+Alt+1",
            "Ctrl+Alt+2",
            () =>
            {
                callbackInvoked = true;
                return true;
            },
            out var error);

        applied.Should().BeTrue(error);
        error.Should().BeEmpty();
        callbackInvoked.Should().BeTrue();
        HotkeyConfiguration.FullScreenDisplay.Should().Be("Ctrl+Alt+1");
        HotkeyConfiguration.RegionDisplay.Should().Be("Ctrl+Alt+2");
        File.Exists(AppSettingsService.TestSettingsPathOverride).Should().BeTrue();
    }

    [Fact]
    public void TryApply_rejects_invalid_full_screen_shortcut()
    {
        var callbackInvoked = false;

        var applied = HotkeySettingsApplier.TryApply(
            "Invalid",
            "Ctrl+Shift+4",
            () =>
            {
                callbackInvoked = true;
                return true;
            },
            out var error);

        applied.Should().BeFalse();
        error.Should().NotBeNullOrWhiteSpace();
        callbackInvoked.Should().BeFalse();
    }

    [Fact]
    public void TryApply_rejects_invalid_region_shortcut()
    {
        var callbackInvoked = false;

        var applied = HotkeySettingsApplier.TryApply(
            "Ctrl+Shift+3",
            "Invalid",
            () =>
            {
                callbackInvoked = true;
                return true;
            },
            out var error);

        applied.Should().BeFalse();
        error.Should().NotBeNullOrWhiteSpace();
        callbackInvoked.Should().BeFalse();
    }
}
