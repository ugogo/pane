using System.Text.Json;

namespace CleanShot.Core.Services;

internal static class AppSettingsService
{
    private static readonly string SettingsFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Home");

    private static readonly string SettingsPath = Path.Combine(SettingsFolder, "cleanshot-settings.json");

    private static readonly string LegacySettingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "CleanShot W",
        "settings.json");

    internal static string? TestSettingsPathOverride { get; set; }

    internal static string? TestLegacySettingsPathOverride { get; set; }

    public static string DefaultSaveFolder { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
        "Screenshots");

    private static string _saveFolder = DefaultSaveFolder;
    private static bool _launchAtStartup = true;

    public static string SaveFolder => _saveFolder;

    public static bool LaunchAtStartup => _launchAtStartup;

    private sealed class SettingsDocument
    {
        public string? FullScreenShortcut { get; set; }

        public string? RegionShortcut { get; set; }

        public string? SaveFolder { get; set; }

        public bool? LaunchAtStartup { get; set; }
    }

    public static void LoadSettings()
    {
        _saveFolder = DefaultSaveFolder;
        _launchAtStartup = true;

        var settingsPath = ResolveReadPath();
        if (!File.Exists(settingsPath))
        {
            return;
        }

        var migratedFromLegacy = IsLegacyMigrationRead(settingsPath);

        try
        {
            var json = File.ReadAllText(settingsPath);
            var settings = JsonSerializer.Deserialize<SettingsDocument>(json);
            if (settings is null)
            {
                return;
            }

            if (settings.FullScreenShortcut is not null
                && HotkeyParser.TryParse(
                    settings.FullScreenShortcut,
                    out var fullScreenModifiers,
                    out var fullScreenKey,
                    out _))
            {
                HotkeyConfiguration.SetFullScreen(fullScreenModifiers, fullScreenKey);
            }

            if (settings.RegionShortcut is not null
                && HotkeyParser.TryParse(
                    settings.RegionShortcut,
                    out var regionModifiers,
                    out var regionKey,
                    out _))
            {
                HotkeyConfiguration.SetRegion(regionModifiers, regionKey);
            }

            if (!string.IsNullOrWhiteSpace(settings.SaveFolder))
            {
                _saveFolder = settings.SaveFolder;
            }

            if (settings.LaunchAtStartup.HasValue)
            {
                _launchAtStartup = settings.LaunchAtStartup.Value;
            }

            AppLog.Info(
                $"Loaded settings: saveFolder={_saveFolder}, launchAtStartup={_launchAtStartup}, screen={HotkeyConfiguration.FullScreenDisplay}, region={HotkeyConfiguration.RegionDisplay}");

            if (migratedFromLegacy)
            {
                SaveSettings();
            }
        }
        catch (Exception ex)
        {
            AppLog.Error(ex);
        }
    }

    public static void SetSaveFolder(string folder)
    {
        _saveFolder = folder;
    }

    public static void SetLaunchAtStartup(bool enabled)
    {
        _launchAtStartup = enabled;
    }

    public static void SaveSettings()
    {
        try
        {
            var settingsFolder = ResolveSettingsFolder();
            Directory.CreateDirectory(settingsFolder);

            var settings = new SettingsDocument
            {
                FullScreenShortcut = HotkeyConfiguration.FullScreenDisplay,
                RegionShortcut = HotkeyConfiguration.RegionDisplay,
                SaveFolder = _saveFolder,
                LaunchAtStartup = _launchAtStartup,
            };

            var json = JsonSerializer.Serialize(
                settings,
                new JsonSerializerOptions { WriteIndented = true });

            var settingsPath = ResolveSettingsPath();
            File.WriteAllText(settingsPath, json);
            AppLog.Info($"Saved settings to {settingsPath}");
        }
        catch (Exception ex)
        {
            AppLog.Error(ex);
        }
    }

    public static void SaveHotkeys() => SaveSettings();

    internal static void ResetForTests()
    {
        TestSettingsPathOverride = null;
        TestLegacySettingsPathOverride = null;
        _saveFolder = DefaultSaveFolder;
        _launchAtStartup = true;
        HotkeyConfiguration.ResetToDefaults();
    }

    private static string ResolveReadPath()
    {
        if (TestSettingsPathOverride is not null)
        {
            if (File.Exists(TestSettingsPathOverride))
            {
                return TestSettingsPathOverride;
            }

            if (TestLegacySettingsPathOverride is not null && File.Exists(TestLegacySettingsPathOverride))
            {
                return TestLegacySettingsPathOverride;
            }

            return TestSettingsPathOverride;
        }

        if (File.Exists(SettingsPath))
        {
            return SettingsPath;
        }

        if (File.Exists(LegacySettingsPath))
        {
            return LegacySettingsPath;
        }

        return SettingsPath;
    }

    private static bool IsLegacyMigrationRead(string settingsPath) =>
        TestSettingsPathOverride is not null
            ? TestLegacySettingsPathOverride is not null
                && string.Equals(settingsPath, TestLegacySettingsPathOverride, StringComparison.OrdinalIgnoreCase)
            : string.Equals(settingsPath, LegacySettingsPath, StringComparison.OrdinalIgnoreCase);

    private static string ResolveSettingsPath() => TestSettingsPathOverride ?? SettingsPath;

    private static string ResolveSettingsFolder() =>
        Path.GetDirectoryName(ResolveSettingsPath()) ?? SettingsFolder;
}
