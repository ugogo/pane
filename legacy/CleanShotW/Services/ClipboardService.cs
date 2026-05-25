using System.Drawing;
using CleanShotW.Helpers;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Streams;

namespace CleanShotW.Services;

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
