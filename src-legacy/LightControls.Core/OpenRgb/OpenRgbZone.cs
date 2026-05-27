namespace LightControls.Core.OpenRgb;

public sealed record OpenRgbZone(
    int Index,
    string Name,
    int LedMin,
    int LedMax,
    int LedCount)
{
    public bool IsResizable => LedMax > LedMin;

    public static bool IsArgbHeaderZone(string name) =>
        name.StartsWith("JARGB", StringComparison.OrdinalIgnoreCase)
        || name.Contains("RAINBOW", StringComparison.OrdinalIgnoreCase);
}
