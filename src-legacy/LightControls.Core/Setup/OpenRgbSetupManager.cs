using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using LightControls.Core.Abstractions;
using LightControls.Core.Settings;

namespace LightControls.Core.Setup;

public sealed class OpenRgbSetupManager(
    LightControlsSettings settings,
    IRgbBackend backend,
    HttpClient? httpClient = null)
{
    private const string ReleasesApiUrl = "https://codeberg.org/api/v1/repos/OpenRGB/OpenRGB/releases?limit=10";
    private const string ReleasesPageUrl = "https://codeberg.org/OpenRGB/OpenRGB/releases";
    private static readonly JsonSerializerOptions ReleaseJsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient = httpClient ?? CreateHttpClient();
    public string? LastDownloadError { get; private set; }

    public async Task<OpenRgbSetupStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        if (await backend.IsServerReachableAsync(cancellationToken))
        {
            return new OpenRgbSetupStatus(OpenRgbSetupState.ServerRunning, "Lighting support is ready.", settings.OpenRgbExecutablePath);
        }

        var executable = FindOpenRgbExecutable();
        return executable is null
            ? new OpenRgbSetupStatus(OpenRgbSetupState.Missing, "OpenRGB is not installed yet. Download it from this app to control your RGB devices.", null)
            : new OpenRgbSetupStatus(OpenRgbSetupState.InstalledButStopped, "OpenRGB is installed but the SDK server is not running.", executable);
    }

    public async Task<OpenRgbSetupStatus> EnsureServerRunningAsync(
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        var status = await GetStatusAsync(cancellationToken);
        if (status.State == OpenRgbSetupState.ServerRunning)
        {
            return status;
        }

        var executable = status.ExecutablePath;
        if (executable is null)
        {
            progress?.Report("Downloading OpenRGB for Windows...");
            executable = await DownloadOpenRgbAsync(progress, cancellationToken);
        }

        if (executable is null)
        {
            var message = string.IsNullOrWhiteSpace(LastDownloadError)
                ? "Could not download OpenRGB. Check your internet connection and try again, or open the Codeberg releases page."
                : $"Could not download OpenRGB: {LastDownloadError}";
            return new OpenRgbSetupStatus(OpenRgbSetupState.DownloadFailed, message, null);
        }

        settings.OpenRgbExecutablePath = executable;
        progress?.Report("Starting OpenRGB server...");
        if (!LaunchOpenRgbServer(executable))
        {
            return new OpenRgbSetupStatus(OpenRgbSetupState.LaunchFailed, "OpenRGB was found, but it could not be launched.", executable);
        }

        for (var attempt = 0; attempt < 20; attempt++)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
            if (await backend.IsServerReachableAsync(cancellationToken))
            {
                return new OpenRgbSetupStatus(OpenRgbSetupState.ServerRunning, "Lighting support is ready.", executable);
            }
        }

        return new OpenRgbSetupStatus(OpenRgbSetupState.LaunchFailed, "OpenRGB launched, but the SDK server did not become reachable.", executable);
    }

    public string? FindOpenRgbExecutable()
    {
        if (IsExecutable(settings.OpenRgbExecutablePath))
        {
            return settings.OpenRgbExecutablePath;
        }

        var candidates = new[]
        {
            Path.Combine(GetManagedOpenRgbDirectory(), "OpenRGB.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "OpenRGB", "OpenRGB.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "OpenRGB", "OpenRGB.exe")
        };

        var fromCandidates = candidates.FirstOrDefault(IsExecutable);
        if (fromCandidates is not null)
        {
            return fromCandidates;
        }

        var managedRoot = GetManagedOpenRgbDirectory();
        if (Directory.Exists(managedRoot))
        {
            var managedExe = Directory.EnumerateFiles(managedRoot, "OpenRGB.exe", SearchOption.AllDirectories).FirstOrDefault();
            if (IsExecutable(managedExe))
            {
                return managedExe;
            }
        }

        return FindOnPath("OpenRGB.exe");
    }

    public static void OpenReleasesPage()
    {
        try
        {
            Process.Start(new ProcessStartInfo(ReleasesPageUrl) { UseShellExecute = true });
        }
        catch
        {
            // Opening the browser is best effort.
        }
    }

    public async Task<string?> DownloadOpenRgbAsync(
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        LastDownloadError = null;
        try
        {
            progress?.Report("Looking for the latest OpenRGB release...");
            var releases = await _httpClient.GetFromJsonAsync<List<CodebergRelease>>(
                ReleasesApiUrl,
                ReleaseJsonOptions,
                cancellationToken);
            var asset = SelectWindowsPortableAsset(releases);
            if (asset is null)
            {
                LastDownloadError = "No Windows 64-bit portable build was found on Codeberg.";
                return null;
            }

            progress?.Report($"Downloading OpenRGB ({asset.Name})...");
            var root = GetManagedOpenRgbDirectory();
            Directory.CreateDirectory(root);
            var zipPath = Path.Combine(root, asset.Name);

            using (var response = await _httpClient.GetAsync(asset.BrowserDownloadUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken))
            {
                response.EnsureSuccessStatusCode();
                await using var zipStream = await response.Content.ReadAsStreamAsync(cancellationToken);
                await using var file = File.Create(zipPath);
                await zipStream.CopyToAsync(file, cancellationToken);
            }

            progress?.Report("Installing OpenRGB...");
            ZipFile.ExtractToDirectory(zipPath, root, overwriteFiles: true);
            File.Delete(zipPath);

            var executable = Directory.EnumerateFiles(root, "OpenRGB.exe", SearchOption.AllDirectories).FirstOrDefault();
            if (!IsExecutable(executable))
            {
                LastDownloadError = "Downloaded OpenRGB, but OpenRGB.exe was not found in the archive.";
                return null;
            }

            progress?.Report("OpenRGB installed.");
            return executable;
        }
        catch (Exception ex)
        {
            LastDownloadError = ex.Message;
            progress?.Report($"Download failed: {ex.Message}");
            return null;
        }
    }

    public static CodebergReleaseAsset? SelectWindowsPortableAsset(IReadOnlyList<CodebergRelease>? releases)
    {
        if (releases is null || releases.Count == 0)
        {
            return null;
        }

        CodebergReleaseAsset? fallback = null;
        foreach (var release in releases)
        {
            foreach (var asset in release.Assets ?? [])
            {
                if (!IsWindows64PortableZip(asset.Name))
                {
                    continue;
                }

                if (IsWinRing0Variant(asset.Name))
                {
                    fallback ??= asset;
                    continue;
                }

                return asset;
            }
        }

        return fallback;
    }

    public bool LaunchOpenRgbServer(string executablePath)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = executablePath,
                Arguments = "--server --startminimized",
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(executablePath) ?? Environment.CurrentDirectory
            });
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsWindows64PortableZip(string name) =>
        name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)
        && name.Contains("Windows_64", StringComparison.OrdinalIgnoreCase)
        && !name.Contains("Windows_32", StringComparison.OrdinalIgnoreCase);

    private static bool IsWinRing0Variant(string name) =>
        name.Contains("wr0", StringComparison.OrdinalIgnoreCase);

    private static bool IsExecutable(string? path) =>
        !string.IsNullOrWhiteSpace(path) && File.Exists(path);

    private static string GetManagedOpenRgbDirectory()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(appData, "LightControls", "OpenRGB");
    }

    private static string? FindOnPath(string executable)
    {
        var path = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        return path
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(directory => Path.Combine(directory, executable))
            .FirstOrDefault(File.Exists);
    }

    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(10)
        };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("LightControls/1.0");
        return client;
    }

    public sealed record CodebergRelease(
        [property: JsonPropertyName("assets")] List<CodebergReleaseAsset>? Assets);

    public sealed record CodebergReleaseAsset(
        string Name,
        [property: JsonPropertyName("browser_download_url")] string BrowserDownloadUrl);
}
