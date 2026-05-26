namespace LightControls.Core.Models;

public static class SceneCatalog
{
    public const string DefaultSceneId = "sunset-glow";

    public static IReadOnlyList<LightingScene> BuiltIn { get; } =
    [
        new LightingScene
        {
            Id = "sunset-glow",
            Name = "Sunset Glow",
            Description = "Warm and vibrant atmosphere",
            ColorHex = "#FF6A00",
            Brightness = 65,
            IconGlyph = "\uE706",
        },
        new LightingScene
        {
            Id = "ocean-blue",
            Name = "Ocean Blue",
            Description = "Cool and calming tones",
            ColorHex = "#00A8FF",
            Brightness = 70,
            IconGlyph = "\uE909",
        },
        new LightingScene
        {
            Id = "neutral-white",
            Name = "Neutral White",
            Description = "Clean and balanced lighting",
            ColorHex = "#F5F6FA",
            Brightness = 55,
            IconGlyph = "\uE706",
        },
    ];

    public static LightingScene? FindById(string? id) =>
        BuiltIn.FirstOrDefault(scene => string.Equals(scene.Id, id, StringComparison.OrdinalIgnoreCase));

    public static LightingScene GetDefault() => FindById(DefaultSceneId) ?? BuiltIn[0];
}
