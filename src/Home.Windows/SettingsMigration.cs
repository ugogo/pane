using System.Text.Json;

namespace Home.Windows;

public static class SettingsMigration
{
    public static bool TryReadJson(string path, out JsonDocument? document)
    {
        document = null;
        if (!File.Exists(path))
        {
            return false;
        }

        try
        {
            document = JsonDocument.Parse(File.ReadAllText(path));
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static string LegacyLightControlsSettingsPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "LightControls",
            "settings.json");

    public static string LegacyCleanShotSettingsPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CleanShot W",
            "settings.json");
}
