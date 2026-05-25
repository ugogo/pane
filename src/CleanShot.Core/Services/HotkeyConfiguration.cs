using CleanShot.Core.Interop;

namespace CleanShot.Core.Services;

internal static class HotkeyConfiguration
{
    public static uint FullScreenModifiers { get; private set; } = Win32Interop.ModControl | Win32Interop.ModShift;
    public static uint FullScreenKey { get; private set; } = Win32Interop.Vk3;
    public static uint RegionModifiers { get; private set; } = Win32Interop.ModControl | Win32Interop.ModShift;
    public static uint RegionKey { get; private set; } = Win32Interop.Vk4;

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
        SetFullScreen(Win32Interop.ModControl | Win32Interop.ModShift, Win32Interop.Vk3);
        SetRegion(Win32Interop.ModControl | Win32Interop.ModShift, Win32Interop.Vk4);
    }
}
