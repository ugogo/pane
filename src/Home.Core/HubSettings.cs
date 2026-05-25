using System.Text.Json;

namespace Home.Core;

public sealed class HubSettings
{
    public bool RunAtStartup { get; set; }

    public bool StartMinimizedToTray { get; set; }

    public bool LegacyImportCompleted { get; set; }

    public string LastOpenedPage { get; set; } = "home";

    public Dictionary<string, bool> EnabledModules { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
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
                return NormalizeMergedModules(new HubSettings());
            }

            var json = File.ReadAllText(SettingsPath);
            return NormalizeMergedModules(JsonSerializer.Deserialize<HubSettings>(json) ?? new HubSettings());
        }
        catch
        {
            return NormalizeMergedModules(new HubSettings());
        }
    }

    public static void Save(HubSettings settings)
    {
        NormalizeMergedModules(settings);
        var directory = Path.GetDirectoryName(SettingsPath)!;
        Directory.CreateDirectory(directory);
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        File.WriteAllText(SettingsPath, json);
    }

    private static HubSettings NormalizeMergedModules(HubSettings settings)
    {
        if (settings.EnabledModules.Remove(HomeServiceCollectionExtensions.DxLightModuleId, out var dxEnabled) && dxEnabled)
        {
            settings.EnabledModules[HomeServiceCollectionExtensions.LightControlsModuleId] = true;
        }

        settings.EnabledModules.Remove(HomeServiceCollectionExtensions.DxLightModuleId, out _);

        if (string.Equals(
                settings.LastOpenedPage,
                HomeServiceCollectionExtensions.DxLightModuleId,
                StringComparison.OrdinalIgnoreCase))
        {
            settings.LastOpenedPage = HomeServiceCollectionExtensions.LightControlsModuleId;
        }

        return settings;
    }
}
