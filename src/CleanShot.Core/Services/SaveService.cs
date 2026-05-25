using System.Drawing;
using System.Drawing.Imaging;

namespace CleanShot.Core.Services;

internal static class SaveService
{
    private static string _saveFolder = AppSettingsService.DefaultSaveFolder;

    public static void Initialize(string saveFolder)
    {
        if (!string.IsNullOrWhiteSpace(saveFolder))
        {
            _saveFolder = saveFolder;
        }
    }

    public static void SetSaveFolder(string folder)
    {
        _saveFolder = folder;
    }

    public static string SaveBitmap(Bitmap bitmap)
    {
        Directory.CreateDirectory(_saveFolder);

        var timestamp = DateTime.Now.ToString("yyyy-MM-dd 'at' HH.mm.ss");
        var filePath = Path.Combine(_saveFolder, $"CleanShot {timestamp}.png");
        bitmap.Save(filePath, ImageFormat.Png);
        return filePath;
    }

    public static string GetSaveFolder() => _saveFolder;

    internal static void ResetForTests()
    {
        _saveFolder = AppSettingsService.DefaultSaveFolder;
    }
}
