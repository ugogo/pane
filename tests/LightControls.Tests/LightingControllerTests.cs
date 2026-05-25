using LightControls.Core;
using LightControls.Core.Models;
using LightControls.Core.Settings;
using LightControls.Tests.Fakes;

namespace LightControls.Tests;

public sealed class LightingControllerTests
{
    [Fact]
    public async Task ApplyToSelectedDevicesAsync_UsesSelectedDevicesAndPersistsLastColor()
    {
        var directory = Directory.CreateTempSubdirectory();
        var path = Path.Combine(directory.FullName, "settings.json");
        var store = new SettingsStore(path);
        var settings = new LightControlsSettings
        {
            SelectedDeviceIds = ["keyboard", "mouse"],
            LastBrightness = 75
        };
        var backend = new FakeRgbBackend();
        var controller = new LightingController(backend, store, settings);

        var color = new RgbColor(1, 2, 3);
        var result = await controller.ApplyToSelectedDevicesAsync(color);
        var persisted = await store.LoadAsync();

        Assert.True(result.Succeeded);
        Assert.Equal(2, backend.LastApplies.Count);
        Assert.All(backend.LastApplies, apply =>
        {
            Assert.Equal(color, apply.Color);
            Assert.Equal(75, apply.BrightnessPercent);
        });
        Assert.Equal(["keyboard", "mouse"], backend.LastApplies.Select(apply => apply.DeviceId).OrderBy(id => id));
        Assert.Equal("#010203", persisted.LastColor);
        Assert.Equal("#010203", persisted.DeviceSettings["keyboard"].Color);
        Assert.Equal("#010203", persisted.DeviceSettings["mouse"].Color);
    }
}
