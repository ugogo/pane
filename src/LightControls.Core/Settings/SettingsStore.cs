using System.Text.Json;

namespace LightControls.Core.Settings;

public sealed class SettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _settingsPath;

    public SettingsStore(string? settingsPath = null)
    {
        _settingsPath = settingsPath ?? GetDefaultSettingsPath();
    }

    public string SettingsPath => _settingsPath;

    public async Task<LightControlsSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_settingsPath))
        {
            return new LightControlsSettings();
        }

        try
        {
            await using var stream = File.OpenRead(_settingsPath);
            return await JsonSerializer.DeserializeAsync<LightControlsSettings>(stream, JsonOptions, cancellationToken)
                ?? new LightControlsSettings();
        }
        catch (JsonException)
        {
            return new LightControlsSettings();
        }
        catch (IOException)
        {
            return new LightControlsSettings();
        }
    }

    public async Task SaveAsync(LightControlsSettings settings, CancellationToken cancellationToken = default)
    {
        var directory = Path.GetDirectoryName(_settingsPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await using var stream = File.Create(_settingsPath);
        await JsonSerializer.SerializeAsync(stream, settings, JsonOptions, cancellationToken);
    }

    public static string GetDefaultSettingsPath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(appData, "LightControls", "settings.json");
    }
}
