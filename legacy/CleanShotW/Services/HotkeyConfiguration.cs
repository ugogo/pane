using CleanShotW.Helpers;

namespace CleanShotW.Services;

internal static class HotkeyConfiguration
{
    public static uint FullScreenModifiers { get; private set; } = Win32Helper.ModControl | Win32Helper.ModShift;
    public static uint FullScreenKey { get; private set; } = Win32Helper.Vk3;
    public static uint RegionModifiers { get; private set; } = Win32Helper.ModControl | Win32Helper.ModShift;
    public static uint RegionKey { get; private set; } = Win32Helper.Vk4;

    public static void SetFullScreen(uint modifiers, uint key)
    {
        FullScreenModifiers = modifiers;
        FullScreenKey = key;
    }

    public static void SetRegion(uint modifiers, uint key)
    {
        RegionModifiers = modifiers;
        RegionKey = key;
    }

    public static string FullScreenDisplay => HotkeyParser.Format(FullScreenModifiers, FullScreenKey);
    public static string RegionDisplay => HotkeyParser.Format(RegionModifiers, RegionKey);

    internal static void ResetToDefaults()
    {
        SetFullScreen(Win32Helper.ModControl | Win32Helper.ModShift, Win32Helper.Vk3);
        SetRegion(Win32Helper.ModControl | Win32Helper.ModShift, Win32Helper.Vk4);
    }
}
