"""Generate Home app icon assets (2x2 squircle mark with lime accent)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "src" / "Home.Hub" / "Assets"
TILE = (18, 18, 24)
INACTIVE = (61, 74, 92)
ACCENT = (184, 245, 58)


def rounded_rect(draw: ImageDraw.ImageDraw, xy, radius: int, fill):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def draw_mark(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = max(2, int(size * 0.1))
    inner = size - pad * 2
    rounded_rect(draw, (pad, pad, pad + inner, pad + inner), max(2, int(inner * 0.22)), TILE)

    gap = max(1, int(size * 0.045))
    cell = (inner - gap) // 2
    ox, oy = pad, pad
    r = max(2, int(cell * 0.35))

    def cell_rect(col: int, row: int):
        left = ox + col * (cell + gap)
        top = oy + row * (cell + gap)
        return (left, top, left + cell, top + cell)

    rounded_rect(draw, cell_rect(0, 0), r, INACTIVE)
    rounded_rect(draw, cell_rect(1, 0), r, INACTIVE)
    rounded_rect(draw, cell_rect(0, 1), r, ACCENT)
    rounded_rect(draw, cell_rect(1, 1), r, INACTIVE)
    return img


def save_ico(path: Path, sizes: list[int]):
    images = [draw_mark(s) for s in sizes]
    images[0].save(
        path,
        format="ICO",
        sizes=[(img.width, img.height) for img in images],
        append_images=images[1:],
    )


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    mark256 = draw_mark(256)
    mark256.save(ASSETS / "app-icon.png")

    save_ico(ASSETS / "app-icon.ico", [16, 24, 32, 48, 256])
    save_ico(ASSETS / "tray-icon.ico", [16, 20, 24, 32])

    for name, size in [
        ("Square44x44Logo.scale-200.png", 88),
        ("Square150x150Logo.scale-200.png", 300),
        ("SplashScreen.scale-200.png", 620),
    ]:
        draw_mark(size).save(ASSETS / name)

    wide = Image.new("RGBA", (620, 300), (12, 12, 18, 255))
    mark = draw_mark(200)
    wide.paste(mark, (30, 50), mark)
    wide.save(ASSETS / "Wide310x150Logo.scale-200.png")

    print(f"Icons written to {ASSETS}")


if __name__ == "__main__":
    main()
