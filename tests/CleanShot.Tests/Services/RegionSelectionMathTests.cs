using System.Drawing;
using CleanShot.Core.Services;
using FluentAssertions;

namespace CleanShot.Tests.Services;

public sealed class RegionSelectionMathTests : TestBase
{
    [Fact]
    public void NormalizeRect_flips_negative_dimensions()
    {
        var normalized = RegionSelectionMath.NormalizeRect(new Rectangle(20, 30, -10, -15));

        normalized.Should().Be(new Rectangle(10, 15, 10, 15));
    }

    [Fact]
    public void HasValidSelection_requires_minimum_size()
    {
        RegionSelectionMath.HasValidSelection(new Rectangle(0, 0, 7, 20)).Should().BeFalse();
        RegionSelectionMath.HasValidSelection(new Rectangle(0, 0, 8, 8)).Should().BeTrue();
    }

    [Fact]
    public void MeetsDragThreshold_uses_either_axis()
    {
        RegionSelectionMath.MeetsDragThreshold(new Rectangle(0, 0, 3, 0)).Should().BeTrue();
        RegionSelectionMath.MeetsDragThreshold(new Rectangle(0, 0, 0, 3)).Should().BeTrue();
        RegionSelectionMath.MeetsDragThreshold(new Rectangle(0, 0, 2, 2)).Should().BeFalse();
    }

    [Fact]
    public void GetCreatingRect_supports_all_drag_quadrants()
    {
        RegionSelectionMath.GetCreatingRect(10, 20, 30, 50)
            .Should()
            .Be(new Rectangle(10, 20, 20, 30));
        RegionSelectionMath.GetCreatingRect(30, 50, 10, 20)
            .Should()
            .Be(new Rectangle(10, 20, 20, 30));
    }

    [Fact]
    public void ClampSelection_keeps_rect_inside_canvas_and_minimum_size()
    {
        var clamped = RegionSelectionMath.ClampSelection(new Rectangle(-5, -5, 4, 4), 100, 80);

        clamped.X.Should().Be(0);
        clamped.Y.Should().Be(0);
        clamped.Width.Should().BeGreaterOrEqualTo(RegionSelectionMath.MinSelectionSize);
        clamped.Height.Should().BeGreaterOrEqualTo(RegionSelectionMath.MinSelectionSize);
    }

    [Fact]
    public void ClampMove_keeps_rect_inside_canvas()
    {
        var moved = RegionSelectionMath.ClampMove(new Rectangle(95, 70, 20, 20), 100, 80);

        moved.X.Should().Be(80);
        moved.Y.Should().Be(60);
    }

    [Fact]
    public void ToScreenRect_scales_logical_selection_to_virtual_screen()
    {
        var virtualBounds = new Rectangle(100, 50, 2000, 1000);
        var screenRect = RegionSelectionMath.ToScreenRect(
            new Rectangle(100, 50, 200, 100),
            canvasWidth: 1000,
            canvasHeight: 500,
            virtualBounds);

        screenRect.X.Should().Be(300);
        screenRect.Y.Should().Be(150);
        screenRect.Width.Should().Be(400);
        screenRect.Height.Should().Be(200);
    }

    [Fact]
    public void ScreenToLogical_maps_screen_coordinates_to_canvas_space()
    {
        var virtualBounds = new Rectangle(100, 50, 2000, 1000);
        var logical = RegionSelectionMath.ScreenToLogical(
            1100,
            550,
            canvasWidth: 1000,
            canvasHeight: 500,
            virtualBounds);

        logical.X.Should().BeApproximately(500, 0.001);
        logical.Y.Should().BeApproximately(250, 0.001);
    }
}
