namespace CleanShotW.Services;

internal static class HotkeySettingsApplier
{
    public static bool TryApply(
        string fullScreenShortcut,
        string regionShortcut,
        Func<bool>? applyHotkeys,
        out string error)
    {
        if (!HotkeyParser.TryParse(fullScreenShortcut, out var fullScreenModifiers, out var fullScreenKey, out error))
        {
            return false;
        }

        if (!HotkeyParser.TryParse(regionShortcut, out var regionModifiers, out var regionKey, out error))
        {
            return false;
        }

        HotkeyConfiguration.SetFullScreen(fullScreenModifiers, fullScreenKey);
        HotkeyConfiguration.SetRegion(regionModifiers, regionKey);
        AppSettingsService.SaveHotkeys();

        var registered = applyHotkeys?.Invoke() ?? true;
        AppLog.Info($"Hotkeys updated: screen={HotkeyConfiguration.FullScreenDisplay}, region={HotkeyConfiguration.RegionDisplay}");
        return registered;
    }
}
