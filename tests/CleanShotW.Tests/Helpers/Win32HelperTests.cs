using CleanShotW.Helpers;
using CleanShotW.Services;
using FluentAssertions;

namespace CleanShotW.Tests.Helpers;

public sealed class Win32HelperTests : TestBase
{
    [Fact]
    public void DescribeWindow_returns_null_label_for_zero_handle()
    {
        Win32Helper.DescribeWindow(IntPtr.Zero).Should().Be("hwnd=null");
    }

    [Fact]
    public void TryRestoreForegroundWindow_returns_false_for_zero_handle()
    {
        Win32Helper.TryRestoreForegroundWindow(IntPtr.Zero).Should().BeFalse();
    }

    [Theory]
    [InlineData("ModControl", 0x0002u)]
    [InlineData("ModShift", 0x0004u)]
    [InlineData("ModAlt", 0x0001u)]
    [InlineData("ModWin", 0x0008u)]
    [InlineData("WmHotkey", 0x0312)]
    public void Constants_match_expected_values(string name, uint expected)
    {
        var actual = name switch
        {
            "ModControl" => Win32Helper.ModControl,
            "ModShift" => Win32Helper.ModShift,
            "ModAlt" => Win32Helper.ModAlt,
            "ModWin" => Win32Helper.ModWin,
            "WmHotkey" => (uint)Win32Helper.WmHotkey,
            _ => throw new ArgumentOutOfRangeException(nameof(name)),
        };

        actual.Should().Be(expected);
    }
}
