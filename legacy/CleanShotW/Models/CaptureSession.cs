using System.Drawing;

namespace CleanShotW.Models;

public sealed class CaptureSession : IDisposable
{
    public CaptureSession(Bitmap bitmap)
    {
        Bitmap = bitmap;
        Id = Guid.NewGuid();
        CreatedAt = DateTimeOffset.Now;
    }

    public Guid Id { get; }

    public Bitmap Bitmap { get; }

    public DateTimeOffset CreatedAt { get; }

    public void Dispose()
    {
        Bitmap.Dispose();
    }
}

internal enum CaptureKind
{
    FullScreen,
    Region,
}
