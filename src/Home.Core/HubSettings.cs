using System.Text.Json;

namespace Home.Core;

public sealed class HubSettings
{
    public bool RunAtStartup { get; set; }

    public string LastOpenedPage { get; set; } = "home";

    public Dictionary<string, bool> EnabledModules { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["dx-light"] = true,
        ["light-controls"] = true,
        ["cleanshot"] = true,
    };
}

public static class HubSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static string SettingsPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Home",
            "hub-settings.json");

    public static HubSettings Load()
    {
        try
        {
            if (!File.Exists(SettingsPath))
            {
                return new HubSettings();
            }

            var json = File.ReadAllText(SettingsPath);
            return JsonSerializer.Deserialize<HubSettings>(json) ?? new HubSettings();
        }
        catch
        {
            return new HubSettings();
        }
    }

    public static void Save(HubSettings settings)
    {
        var directory = Path.GetDirectoryName(SettingsPath)!;
        Directory.CreateDirectory(directory);
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        File.WriteAllText(SettingsPath, json);
    }
}
