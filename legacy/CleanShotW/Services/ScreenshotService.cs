using System.Drawing;
using CleanShotW.Helpers;

namespace CleanShotW.Services;

internal static class ScreenshotService
{
    public static Bitmap CaptureFullScreen()
    {
        var bounds = Win32Helper.GetVirtualScreenBounds();
        return CaptureRegion(bounds);
    }

    public static Bitmap CaptureRegion(Rectangle bounds)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            throw new InvalidOperationException("Capture region must have positive dimensions.");
        }

        var bitmap = new Bitmap(bounds.Width, bounds.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
        return bitmap;
    }
}
