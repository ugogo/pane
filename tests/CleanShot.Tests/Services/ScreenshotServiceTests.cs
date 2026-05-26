using System.Drawing;
using CleanShot.Core.Services;
using FluentAssertions;

namespace CleanShot.Tests.Services;

public sealed class ScreenshotServiceTests : TestBase
{
    [Theory]
    [InlineData(0, 10)]
    [InlineData(10, 0)]
    [InlineData(-5, 10)]
    public void CaptureRegion_rejects_non_positive_dimensions(int width, int height)
    {
        var act = () => ScreenshotService.CaptureRegion(new Rectangle(0, 0, width, height));

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*positive dimensions*");
    }
}
