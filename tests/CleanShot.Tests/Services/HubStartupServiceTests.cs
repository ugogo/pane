using FluentAssertions;
using Home.Windows;

namespace CleanShot.Tests.Services;

public sealed class HubStartupServiceTests : TestBase
{
    [Fact]
    public void Apply_enabled_registers_login_and_wake_startup()
    {
        var runKeyApplied = false;
        var wakeTaskApplied = false;

        HubStartupService.TestApplyRunKeyOverride = enabled => runKeyApplied = enabled;
        HubStartupService.TestApplyWakeTaskOverride = enabled => wakeTaskApplied = enabled;

        HubStartupService.Apply(true);

        runKeyApplied.Should().BeTrue();
        wakeTaskApplied.Should().BeTrue();
    }

    [Fact]
    public void Apply_disabled_removes_login_and_wake_startup()
    {
        var runKeyApplied = true;
        var wakeTaskApplied = true;

        HubStartupService.TestApplyRunKeyOverride = enabled => runKeyApplied = enabled;
        HubStartupService.TestApplyWakeTaskOverride = enabled => wakeTaskApplied = enabled;

        HubStartupService.Apply(false);

        runKeyApplied.Should().BeFalse();
        wakeTaskApplied.Should().BeFalse();
    }
}
