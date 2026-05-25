namespace LightControls.Core.Setup;

public enum OpenRgbSetupState
{
    ServerRunning,
    InstalledButStopped,
    Missing,
    LaunchFailed,
    DownloadFailed
}

public sealed record OpenRgbSetupStatus(OpenRgbSetupState State, string Message, string? ExecutablePath);
