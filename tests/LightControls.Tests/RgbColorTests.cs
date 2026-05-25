using LightControls.Core.Models;

namespace LightControls.Tests;

public sealed class RgbColorTests
{
    [Fact]
    public void FromHex_ParsesRgbValues()
    {
        var color = RgbColor.FromHex("#12A4FF");

        Assert.Equal(0x12, color.Red);
        Assert.Equal(0xA4, color.Green);
        Assert.Equal(0xFF, color.Blue);
        Assert.Equal("#12A4FF", color.ToHex());
    }

    [Fact]
    public void ToOpenRgbColor_UsesOpenRgbByteOrder()
    {
        var color = new RgbColor(0x12, 0x34, 0x56);

        Assert.Equal(0x00563412u, color.ToOpenRgbColor());
    }

    [Fact]
    public void WithBrightness_ScalesChannels()
    {
        var color = new RgbColor(200, 100, 50).WithBrightness(50);

        Assert.Equal((byte)100, color.Red);
        Assert.Equal((byte)50, color.Green);
        Assert.Equal((byte)25, color.Blue);
    }
}
