using CleanShot.WinUI.Helpers;
using CleanShot.Core.Services;
using CleanShot.Core.Interop;
using CleanShotW.Services;
using FluentAssertions;
using Windows.System;

namespace CleanShotW.Tests.Services;

public sealed class HotkeyParserTests : TestBase
{
    [Theory]
    [InlineData("Ctrl+Shift+3")]
    [InlineData("Control+Shift+4")]
    [InlineData("ctrl+alt+a")]
    [InlineData("Win+Shift+Z")]
    [InlineData("Windows+Alt+9")]
    public void TryParse_accepts_valid_shortcuts(string shortcut)
    {
        var parsed = HotkeyParser.TryParse(shortcut, out var modifiers, out var virtualKey, out var error);

        parsed.Should().BeTrue(error);
        modifiers.Should().NotBe(0u);
        virtualKey.Should().NotBe(0u);
        error.Should().BeEmpty();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Ctrl")]
    [InlineData("A")]
    [InlineData("Ctrl+A+B")]
    [InlineData("Cmd+A")]
    [InlineData("Ctrl+F1")]
    [InlineData("Ctrl+Space")]
    public void TryParse_rejects_invalid_shortcuts(string shortcut)
    {
        var parsed = HotkeyParser.TryParse(shortcut, out _, out _, out var error);

        parsed.Should().BeFalse();
        error.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void Format_orders_modifiers_consistently()
    {
        var formatted = HotkeyParser.Format(
            Win32Interop.ModWin | Win32Interop.ModAlt | Win32Interop.ModShift | Win32Interop.ModControl,
            Win32Interop.Vk3);

        formatted.Should().Be("Ctrl+Shift+Alt+Win+3");
    }

    [Fact]
    public void FormatModifiers_omits_key()
    {
        HotkeyParser.FormatModifiers(Win32Interop.ModControl | Win32Interop.ModShift)
            .Should()
            .Be("Ctrl+Shift");
    }

    [Theory]
    [InlineData(VirtualKey.Shift, true)]
    [InlineData(VirtualKey.LeftControl, true)]
    [InlineData(VirtualKey.RightWindows, true)]
    [InlineData(VirtualKey.A, false)]
    [InlineData(VirtualKey.Number3, false)]
    public void IsModifierKey_detects_modifier_keys(VirtualKey key, bool expected)
    {
        HotkeyCaptureHelper.IsModifierKey(key).Should().Be(expected);
    }

    [Fact]
    public void TryParse_and_Format_round_trip_default_shortcuts()
    {
        RoundTrip("Ctrl+Shift+3").Should().BeTrue();
        RoundTrip("Ctrl+Shift+4").Should().BeTrue();
    }

    [Fact]
    public void TryParse_duplicate_modifiers_are_merged()
    {
        var parsed = HotkeyParser.TryParse("Ctrl+Ctrl+3", out var modifiers, out var virtualKey, out _);

        parsed.Should().BeTrue();
        modifiers.Should().Be(Win32Interop.ModControl);
        virtualKey.Should().Be(Win32Interop.Vk3);
    }

    private static bool RoundTrip(string shortcut)
    {
        if (!HotkeyParser.TryParse(shortcut, out var modifiers, out var virtualKey, out _))
        {
            return false;
        }

        return HotkeyParser.Format(modifiers, virtualKey) == shortcut;
    }
}
