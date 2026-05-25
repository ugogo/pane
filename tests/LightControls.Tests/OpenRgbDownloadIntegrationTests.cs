using System.Net;
using System.Text.Json;
using LightControls.Core.Setup;
using static LightControls.Core.Setup.OpenRgbSetupManager;

namespace LightControls.Tests;

public sealed class OpenRgbDownloadIntegrationTests
{
    [Fact]
    [Trait("Category", "Integration")]
    public async Task CodebergReleases_DeserializeAndSelectWindowsPortableAsset()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("LightControls/1.0");

        var json = await client.GetStringAsync("https://codeberg.org/api/v1/repos/OpenRGB/OpenRGB/releases?limit=3");
        var releases = JsonSerializer.Deserialize<List<CodebergRelease>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        var asset = SelectWindowsPortableAsset(releases);

        Assert.NotNull(asset);
        Assert.Contains("Windows_64", asset.Name, StringComparison.OrdinalIgnoreCase);
        Assert.EndsWith(".zip", asset.Name, StringComparison.OrdinalIgnoreCase);
        Assert.StartsWith("https://codeberg.org/", asset.BrowserDownloadUrl, StringComparison.OrdinalIgnoreCase);
    }
}
