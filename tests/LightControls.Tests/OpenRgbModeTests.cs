using LightControls.Core.OpenRgb;

namespace LightControls.Tests;

public sealed class OpenRgbModeTests
{
    [Fact]
    public void FindCustomModeIndex_PrefersDirectPerLedMode()
    {
        var modes = new[]
        {
            CreateMode(0, "Rainbow", colorMode: 3),
            CreateMode(1, "Direct", colorMode: 1),
            CreateMode(2, "Static", colorMode: 2)
        };

        Assert.Equal(1, OpenRgbMode.FindCustomModeIndex(modes));
    }

    [Fact]
    public void WithBrightnessPercent_MapsToDeviceRange()
    {
        var mode = CreateMode(0, "Direct", colorMode: 1) with
        {
            Flags = 1 << 4,
            BrightnessMin = 0,
            BrightnessMax = 4,
            Brightness = 0
        };

        var updated = mode.WithBrightnessPercent(100);

        Assert.Equal(4u, updated.Brightness);
    }

    [Fact]
    public void PackUpdateModePayload_IncludesLeadingDataSize()
    {
        var mode = CreateMode(2, "Direct", colorMode: 1);
        var payload = mode.PackUpdateModePayload(protocolVersion: 5);

        Assert.Equal((uint)payload.Length, BitConverter.ToUInt32(payload, 0));
        Assert.Equal(2, BitConverter.ToInt32(payload, 4));
    }

    private static OpenRgbMode CreateMode(int index, string name, uint colorMode) =>
        new(index, name, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, colorMode, []);
}
