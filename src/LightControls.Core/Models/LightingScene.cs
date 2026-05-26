namespace LightControls.Core.Models;

public sealed class LightingScene
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required string Description { get; init; }

    public required string ColorHex { get; init; }

    public required int Brightness { get; init; }

    public string IconGlyph { get; init; } = "\uE706";
}
