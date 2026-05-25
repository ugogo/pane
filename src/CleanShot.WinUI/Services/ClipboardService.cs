using System.Drawing;
using CleanShot.WinUI.Helpers;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Streams;

namespace CleanShot.WinUI.Services;

internal static class ClipboardService
{
    public static async Task CopyBitmapAsync(Bitmap bitmap)
    {
        var stream = await BitmapHelper.ToPngStreamAsync(bitmap);
        var reference = RandomAccessStreamReference.CreateFromStream(stream);

        var package = new DataPackage
        {
            RequestedOperation = DataPackageOperation.Copy,
        };
        package.SetBitmap(reference);

        Clipboard.SetContent(package);
        Clipboard.Flush();
    }
}
