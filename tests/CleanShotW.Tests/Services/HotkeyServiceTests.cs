using CleanShot.WinUI.Helpers;
using CleanShot.Core.Services;
using FluentAssertions;

namespace CleanShotW.Tests.Services;

public sealed class HotkeyServiceTests : TestBase
{
    [Fact]
    public void TryHandleMessage_ignores_non_hotkey_messages()
    {
        using var service = new HotkeyService(new IntPtr(1));
        var invoked = false;
        service.HotkeyPressed += _ => invoked = true;

        var handled = service.TryHandleMessage(0x0001, IntPtr.Zero);

        handled.Should().BeFalse();
        invoked.Should().BeFalse();
    }

    [Fact]
    public void TryHandleMessage_invokes_callback_for_hotkey_message()
    {
        using var service = new HotkeyService(new IntPtr(1));
        int? receivedId = null;
        service.HotkeyPressed += id => receivedId = id;

        var handled = service.TryHandleMessage(Win32Helper.WmHotkey, (IntPtr)HotkeyService.HotkeyRegion);

        handled.Should().BeTrue();
        receivedId.Should().Be(HotkeyService.HotkeyRegion);
    }

    [Fact]
    public void BuildBindingsForTests_omits_duplicate_region_binding()
    {
        HotkeyConfiguration.SetFullScreen(
            Win32Helper.ModControl | Win32Helper.ModShift,
            Win32Helper.Vk3);
        HotkeyConfiguration.SetRegion(
            Win32Helper.ModControl | Win32Helper.ModShift,
            Win32Helper.Vk3);

        var bindings = HotkeyService.BuildBindingsForTests();

        bindings.Should().HaveCount(1);
        bindings[0].Id.Should().Be(HotkeyService.HotkeyFullScreen);
    }

    [Fact]
    public void BuildBindingsForTests_includes_region_when_different()
    {
        HotkeyConfiguration.ResetToDefaults();

        var bindings = HotkeyService.BuildBindingsForTests();

        bindings.Should().HaveCount(2);
        bindings.Select(binding => binding.Id)
            .Should()
            .BeEquivalentTo([HotkeyService.HotkeyFullScreen, HotkeyService.HotkeyRegion]);
    }
}
