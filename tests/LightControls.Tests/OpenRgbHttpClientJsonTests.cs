using System.Net.Http.Json;
using LightControls.Core.Setup;
using static LightControls.Core.Setup.OpenRgbSetupManager;

namespace LightControls.Tests;

public sealed class OpenRgbHttpClientJsonTests
{
    [Fact]
    public async Task GetFromJsonAsync_SelectsAsset_LikeProductionHttpClient()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("LightControls/1.0");

        var releases = await client.GetFromJsonAsync<List<CodebergRelease>>(
            "https://codeberg.org/api/v1/repos/OpenRGB/OpenRGB/releases?limit=3");

        var asset = SelectWindowsPortableAsset(releases);

        Assert.NotNull(asset);
        Assert.Contains("Windows_64", asset.Name, StringComparison.OrdinalIgnoreCase);
    }
}
