using CleanShotW.Services;
using FluentAssertions;

namespace CleanShotW.Tests.Services;

public sealed class StartupServiceTests : TestBase
{
    [Fact]
    public void Apply_enabled_registers_login_and_wake_startup()
    {
        var runKeyApplied = false;
        var wakeTaskApplied = false;

        StartupService.TestApplyRunKeyOverride = enabled => runKeyApplied = enabled;
        StartupService.TestApplyWakeTaskOverride = enabled => wakeTaskApplied = enabled;

        StartupService.Apply(true);

        runKeyApplied.Should().BeTrue();
        wakeTaskApplied.Should().BeTrue();
    }

    [Fact]
    public void Apply_disabled_removes_login_and_wake_startup()
    {
        var runKeyApplied = true;
        var wakeTaskApplied = true;

        StartupService.TestApplyRunKeyOverride = enabled => runKeyApplied = enabled;
        StartupService.TestApplyWakeTaskOverride = enabled => wakeTaskApplied = enabled;

        StartupService.Apply(false);

        runKeyApplied.Should().BeFalse();
        wakeTaskApplied.Should().BeFalse();
    }
}
