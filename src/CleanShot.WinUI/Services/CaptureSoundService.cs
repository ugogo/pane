using System.Runtime.InteropServices;

namespace CleanShot.WinUI.Services;

internal static class CaptureSoundService
{
    private const uint SndAsync = 0x0001;
    private const uint SndFilename = 0x00020000;
    private const uint SndNodDefault = 0x00000002;

    private static readonly string BundledShutterPath = Path.Combine(
        AppContext.BaseDirectory,
        "Assets",
        "capture-shutter.wav");

    [DllImport("winmm.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool PlaySound(string? soundName, IntPtr module, uint flags);

    public static void PlayCaptureComplete()
    {
        try
        {
            if (!File.Exists(BundledShutterPath))
            {
                return;
            }

            PlaySound(BundledShutterPath, IntPtr.Zero, SndAsync | SndFilename | SndNodDefault);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Capture sound failed: {ex.Message}");
        }
    }
}
