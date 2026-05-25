using System.Drawing;
using CleanShotW.Models;
using CleanShotW.Tests;
using FluentAssertions;

namespace CleanShotW.Tests.Models;

public sealed class CaptureSessionTests : TestBase
{
    [Fact]
    public void Constructor_assigns_unique_id_and_bitmap()
    {
        using var bitmap = new Bitmap(4, 4);
        using var session = new CaptureSession(bitmap);

        session.Id.Should().NotBe(Guid.Empty);
        session.Bitmap.Should().BeSameAs(bitmap);
        session.CreatedAt.Should().BeCloseTo(DateTimeOffset.Now, TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void Dispose_disposes_underlying_bitmap()
    {
        var bitmap = new Bitmap(4, 4);
        var session = new CaptureSession(bitmap);

        session.Dispose();

        var act = () => _ = bitmap.Width;
        act.Should().Throw<Exception>();
    }
}
