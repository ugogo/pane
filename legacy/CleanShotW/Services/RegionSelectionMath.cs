using System.Drawing;

namespace CleanShotW.Services;

internal static class RegionSelectionMath
{
    public const int MinSelectionSize = 8;
    public const int DragStartThreshold = 3;

    public static Rectangle NormalizeRect(Rectangle rect)
    {
        if (rect.Width < 0)
        {
            rect.X += rect.Width;
            rect.Width = -rect.Width;
        }

        if (rect.Height < 0)
        {
            rect.Y += rect.Height;
            rect.Height = -rect.Height;
        }

        return rect;
    }

    public static bool HasValidSelection(Rectangle rect) =>
        rect.Width >= MinSelectionSize && rect.Height >= MinSelectionSize;

    public static bool MeetsDragThreshold(Rectangle rect) =>
        rect.Width >= DragStartThreshold || rect.Height >= DragStartThreshold;

    public static Rectangle GetCreatingRect(double startX, double startY, double currentX, double currentY)
    {
        var x = (int)Math.Min(startX, currentX);
        var y = (int)Math.Min(startY, currentY);
        var width = (int)Math.Abs(startX - currentX);
        var height = (int)Math.Abs(startY - currentY);
        return new Rectangle(x, y, width, height);
    }

    public static Rectangle ClampSelection(Rectangle rect, int canvasWidth, int canvasHeight)
    {
        rect = NormalizeRect(rect);

        if (rect.X < 0)
        {
            rect.Width += rect.X;
            rect.X = 0;
        }

        if (rect.Y < 0)
        {
            rect.Height += rect.Y;
            rect.Y = 0;
        }

        if (rect.Right > canvasWidth)
        {
            rect.Width = canvasWidth - rect.X;
        }

        if (rect.Bottom > canvasHeight)
        {
            rect.Height = canvasHeight - rect.Y;
        }

        rect.Width = Math.Max(rect.Width, MinSelectionSize);
        rect.Height = Math.Max(rect.Height, MinSelectionSize);
        return rect;
    }

    public static Rectangle ClampMove(Rectangle rect, int canvasWidth, int canvasHeight)
    {
        rect.X = Math.Clamp(rect.X, 0, Math.Max(0, canvasWidth - rect.Width));
        rect.Y = Math.Clamp(rect.Y, 0, Math.Max(0, canvasHeight - rect.Height));
        return rect;
    }

    public static Rectangle ToScreenRect(
        Rectangle logicalSelection,
        int canvasWidth,
        int canvasHeight,
        Rectangle virtualBounds)
    {
        canvasWidth = Math.Max(1, canvasWidth);
        canvasHeight = Math.Max(1, canvasHeight);

        return new Rectangle(
            virtualBounds.X + (int)Math.Round(logicalSelection.X / (double)canvasWidth * virtualBounds.Width),
            virtualBounds.Y + (int)Math.Round(logicalSelection.Y / (double)canvasHeight * virtualBounds.Height),
            (int)Math.Round(logicalSelection.Width / (double)canvasWidth * virtualBounds.Width),
            (int)Math.Round(logicalSelection.Height / (double)canvasHeight * virtualBounds.Height));
    }

    public static (double X, double Y) ScreenToLogical(
        int screenX,
        int screenY,
        int canvasWidth,
        int canvasHeight,
        Rectangle virtualBounds)
    {
        canvasWidth = Math.Max(1, canvasWidth);
        canvasHeight = Math.Max(1, canvasHeight);
        var physicalX = screenX - virtualBounds.X;
        var physicalY = screenY - virtualBounds.Y;

        return (
            physicalX / (double)virtualBounds.Width * canvasWidth,
            physicalY / (double)virtualBounds.Height * canvasHeight);
    }
}
