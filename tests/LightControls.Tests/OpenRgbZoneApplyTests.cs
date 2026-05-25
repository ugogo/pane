using LightControls.Core.Models;
using LightControls.Core.OpenRgb;

namespace LightControls.Tests;

public sealed class OpenRgbZoneApplyTests
{
    private static OpenRgbZone CreateZone(string name, int min, int max, int count) =>
        new(0, name, min, max, count);

    [Fact]
    public void ResolveZoneLedCount_UsesDefaultForArgbHeaders()
    {
        var zone = CreateZone("JARGB 2", 0, 240, 1);

        Assert.Equal(OpenRgbProtocolClient.DefaultArgbHeaderLedCount, OpenRgbProtocolClient.ResolveZoneLedCount(zone));
    }

    [Fact]
    public void ResolveZoneLedCount_KeepsJafAtReportedCount()
    {
        var zone = CreateZone("JAF", 0, 240, 1);

        Assert.Equal(1, OpenRgbProtocolClient.ResolveZoneLedCount(zone));
    }

    [Fact]
    public void BuildUpdateZoneLedsPayload_IncludesZoneIndexAndColors()
    {
        var payload = OpenRgbProtocolClient.BuildUpdateZoneLedsPayload(2, 2, new RgbColor(0x10, 0x20, 0x30));

        Assert.Equal((uint)payload.Length, BitConverter.ToUInt32(payload, 0));
        Assert.Equal(2u, BitConverter.ToUInt32(payload, 4));
        Assert.Equal((ushort)2, BitConverter.ToUInt16(payload, 8));
        Assert.Equal(0x00302010u, BitConverter.ToUInt32(payload, 10));
        Assert.Equal(0x00302010u, BitConverter.ToUInt32(payload, 14));
    }
}
