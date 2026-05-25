using System.Text.Json;
using Home.Windows;

namespace Home.Core;

public static class HubSettingsMigration
{
    private const string LegacyCleanShotStartupName = "CleanShot W";
    private const string LegacyDxLightStartupName = "DX Light";
    private const string LegacyLightControlsStartupName = "LightControls";

    public static HubSettings ApplyFirstRunImport(HubSettings settings)
    {
        if (settings.LegacyImportCompleted)
        {
            return settings;
        }

        settings.RunAtStartup = settings.RunAtStartup
            || AnyLegacyStartupRegistered()
            || ReadCleanShotLaunchAtStartup()
            || ReadLightControlsRunAtStartup();

        settings.LegacyImportCompleted = true;
        HubSettingsStore.Save(settings);

        DisableLegacyStartupEntries();

        if (settings.RunAtStartup)
        {
            var exePath = Environment.ProcessPath;
            if (!string.IsNullOrWhiteSpace(exePath))
            {
                WindowsStartupRegistry.Enable("Home", exePath);
            }
        }

        return settings;
    }

    private static bool AnyLegacyStartupRegistered() =>
        WindowsStartupRegistry.IsEnabled(LegacyCleanShotStartupName)
        || WindowsStartupRegistry.IsEnabled(LegacyDxLightStartupName)
        || WindowsStartupRegistry.IsEnabled(LegacyLightControlsStartupName);

    private static bool ReadCleanShotLaunchAtStartup() =>
        ReadBooleanSetting(SettingsMigration.LegacyCleanShotSettingsPath, "LaunchAtStartup");

    private static bool ReadLightControlsRunAtStartup() =>
        ReadBooleanSetting(SettingsMigration.LegacyLightControlsSettingsPath, "RunAtStartup");

    private static bool ReadBooleanSetting(string path, string propertyName)
    {
        if (!SettingsMigration.TryReadJson(path, out var document) || document is null)
        {
            return false;
        }

        using (document)
        {
            return document.RootElement.TryGetProperty(propertyName, out var property)
                && property.ValueKind == JsonValueKind.True;
        }
    }

    private static void DisableLegacyStartupEntries()
    {
        WindowsStartupRegistry.Disable(LegacyCleanShotStartupName);
        WindowsStartupRegistry.Disable(LegacyDxLightStartupName);
        WindowsStartupRegistry.Disable(LegacyLightControlsStartupName);
    }
}
