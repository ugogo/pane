using LightControls.Core.Settings;

namespace LightControls.Tests;

public sealed class SettingsStoreTests
{
    [Fact]
    public async Task LoadAsync_ReturnsDefaults_WhenFileIsMissing()
    {
        var path = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"), "settings.json");
        var store = new SettingsStore(path);

        var settings = await store.LoadAsync();

        Assert.Equal("127.0.0.1", settings.Host);
        Assert.Equal(6742, settings.Port);
        Assert.Empty(settings.RecentCustomColors);
    }

    [Fact]
    public async Task SaveAsync_AndLoadAsync_RoundTripSettings()
    {
        var directory = Directory.CreateTempSubdirectory();
        var path = Path.Combine(directory.FullName, "settings.json");
        var store = new SettingsStore(path);
        var settings = new LightControlsSettings
        {
            Host = "localhost",
            Port = 1234,
            LastColor = "#ABCDEF",
            LastBrightness = 80,
            SelectedDeviceIds = ["device-1"],
            DeviceSettings =
            {
                ["mouse"] = new DeviceLightingSettings { Color = "#112233", Brightness = 55 }
            }
        };

        await store.SaveAsync(settings);
        var loaded = await store.LoadAsync();

        Assert.Equal("localhost", loaded.Host);
        Assert.Equal(1234, loaded.Port);
        Assert.Equal("#ABCDEF", loaded.LastColor);
        Assert.Equal(80, loaded.LastBrightness);
        Assert.Equal(["device-1"], loaded.SelectedDeviceIds);
        Assert.Equal("#112233", loaded.DeviceSettings["mouse"].Color);
        Assert.Equal(55, loaded.DeviceSettings["mouse"].Brightness);
    }

    [Fact]
    public void GetOrCreateDeviceSettings_UsesLastColorAndBrightnessForNewDevices()
    {
        var settings = new LightControlsSettings
        {
            LastColor = "#FF0000",
            LastBrightness = 42
        };

        var deviceSettings = settings.GetOrCreateDeviceSettings("new-device");

        Assert.Equal("#FF0000", deviceSettings.Color);
        Assert.Equal(42, deviceSettings.Brightness);
        Assert.Same(deviceSettings, settings.DeviceSettings["new-device"]);
    }

    [Fact]
    public async Task LoadAsync_ReturnsDefaults_WhenJsonIsCorrupt()
    {
        var directory = Directory.CreateTempSubdirectory();
        var path = Path.Combine(directory.FullName, "settings.json");
        await File.WriteAllTextAsync(path, "{ broken json");
        var store = new SettingsStore(path);

        var settings = await store.LoadAsync();

        Assert.Equal("127.0.0.1", settings.Host);
        Assert.Equal(6742, settings.Port);
    }
}
