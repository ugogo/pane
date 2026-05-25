using System.Buffers.Binary;
using System.Text;

namespace LightControls.Core.OpenRgb;

public sealed record OpenRgbMode(
    int Index,
    string Name,
    int Value,
    uint Flags,
    uint SpeedMin,
    uint SpeedMax,
    uint? BrightnessMin,
    uint? BrightnessMax,
    uint ColorsMin,
    uint ColorsMax,
    uint Speed,
    uint? Brightness,
    uint Direction,
    uint ColorMode,
    IReadOnlyList<uint> ModeColors)
{
    private const uint ModeFlagHasBrightness = 1 << 4;
    private const uint ModeColorsPerLed = 1;
    private const uint ModeColorsModeSpecific = 2;

    private static readonly string[] CustomModeNames = ["Direct", "Custom", "Static"];

    public bool SupportsBrightness => (Flags & ModeFlagHasBrightness) != 0;

    public OpenRgbMode WithBrightnessPercent(int brightnessPercent)
    {
        if (!SupportsBrightness)
        {
            return this;
        }

        var min = BrightnessMin ?? 0;
        var max = BrightnessMax ?? min;
        if (max < min)
        {
            (min, max) = (max, min);
        }

        var scale = Math.Clamp(brightnessPercent, 0, 100) / 100d;
        var brightness = min + (uint)Math.Round((max - min) * scale);
        return this with { Brightness = brightness };
    }

    public static int? FindCustomModeIndex(IReadOnlyList<OpenRgbMode> modes)
    {
        foreach (var customName in CustomModeNames)
        {
            foreach (var mode in modes)
            {
                if (!string.Equals(mode.Name, customName, StringComparison.Ordinal))
                {
                    continue;
                }

                if (mode.ColorMode is ModeColorsPerLed or ModeColorsModeSpecific)
                {
                    return mode.Index;
                }
            }
        }

        return null;
    }

    public byte[] PackUpdateModePayload(uint protocolVersion)
    {
        var nameBytes = Encoding.UTF8.GetBytes(Name + "\0");
        var modeNameLength = checked((ushort)nameBytes.Length);
        var colorCount = ModeColors.Count;

        var bodySize = sizeof(int)
            + sizeof(ushort) + nameBytes.Length
            + sizeof(int) + sizeof(uint) * 6
            + (protocolVersion >= 3 ? sizeof(uint) * 2 : 0)
            + sizeof(uint) * 4
            + (protocolVersion >= 3 ? sizeof(uint) : 0)
            + sizeof(uint)
            + sizeof(ushort) + colorCount * sizeof(uint);

        var payload = new byte[sizeof(uint) + bodySize];
        var offset = 0;

        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), (uint)payload.Length);
        offset += sizeof(uint);

        BinaryPrimitives.WriteInt32LittleEndian(payload.AsSpan(offset, 4), Index);
        offset += sizeof(int);

        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(offset, 2), modeNameLength);
        offset += sizeof(ushort);
        nameBytes.CopyTo(payload.AsSpan(offset));
        offset += nameBytes.Length;

        BinaryPrimitives.WriteInt32LittleEndian(payload.AsSpan(offset, 4), Value);
        offset += sizeof(int);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), Flags);
        offset += sizeof(uint);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), SpeedMin);
        offset += sizeof(uint);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), SpeedMax);
        offset += sizeof(uint);

        if (protocolVersion >= 3)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), BrightnessMin ?? 0);
            offset += sizeof(uint);
            BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), BrightnessMax ?? 0);
            offset += sizeof(uint);
        }

        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), ColorsMin);
        offset += sizeof(uint);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), ColorsMax);
        offset += sizeof(uint);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), Speed);
        offset += sizeof(uint);

        if (protocolVersion >= 3)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), Brightness ?? 0);
            offset += sizeof(uint);
        }

        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), Direction);
        offset += sizeof(uint);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), ColorMode);
        offset += sizeof(uint);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(offset, 2), (ushort)colorCount);
        offset += sizeof(ushort);

        foreach (var modeColor in ModeColors)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset, 4), modeColor);
            offset += sizeof(uint);
        }

        return payload;
    }
}
