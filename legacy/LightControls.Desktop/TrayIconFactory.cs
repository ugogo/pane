using System.Drawing;
using System.Drawing.Drawing2D;

namespace LightControls.Desktop;

internal static class TrayIconFactory
{
    public static Icon Create()
    {
        const int size = 32;
        using var bitmap = new Bitmap(size, size);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.Clear(Color.Transparent);

        using var glow = new SolidBrush(Color.FromArgb(255, 190, 92));
        using var core = new SolidBrush(Color.FromArgb(240, 160, 48));
        graphics.FillEllipse(glow, 3, 3, size - 6, size - 6);
        graphics.FillEllipse(core, 8, 8, size - 16, size - 16);

        var handle = bitmap.GetHicon();
        var icon = Icon.FromHandle(handle);
        var cloned = (Icon)icon.Clone();
        icon.Dispose();
        NativeMethods.DestroyIcon(handle);
        return cloned;
    }

    private static class NativeMethods
    {
        [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
        public static extern bool DestroyIcon(IntPtr hIcon);
    }
}
