#!/usr/bin/env python3
"""Значки приложения (PNG) для главного экрана iPhone и установки как приложения.

Запуск:
  python tools/make_icons.py путь/к/картинке.png    значки из вашей картинки (лучше квадрат 1024×1024 и больше, без текста)
  python tools/make_icons.py                        значки из tools/icon-source.png, а если его нет, временный значок «G» с карандашной чертой

Нужен Pillow (pip install pillow). Получаются четыре файла в icons/:
  icon-192.png и icon-512.png      обычные значки (манифест и вкладка браузера)
  apple-touch-icon.png (180×180)   значок на «Домой» в iPhone: без прозрачности, углы iOS скругляет сама
  icon-maskable-512.png            для Android: рисунок уменьшен, чтобы маска не срезала края
После замены значков поменяйте номер сборки (достаточно закоммитить: Actions сам проставит новый) и добавьте приложение на «Домой» заново:
iPhone запоминает значок в момент добавления.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
SOURCE = ROOT / "tools" / "icon-source.png"

INK = (27, 34, 49)  # чернила: фон приложения в тёмной теме и цвет текста в светлой
PAPER = (244, 245, 240)
PENCIL = (143, 168, 255)  # синий карандаш, светлый вариант (на тёмном фоне)

FONTS = [  # первая найденная засечная гарнитура; на iPhone сам рисунок не зависит от шрифтов
    "/usr/share/fonts/X11/Type1/c0632bt_.pfb",  # Bitstream Charter Bold
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "C:/Windows/Fonts/georgiab.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
]


def find_font(size):
    for path in FONTS:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("Не нашёл подходящий шрифт для временного значка. Передайте свою картинку: python tools/make_icons.py картинка.png")


def bezier(p0, p1, p2, p3, n=80):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t**2, t**3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def placeholder(size=1024):
    """Тёмная «бумага», светлая буква G и синяя карандашная черта под ней: слово, помеченное в тексте."""
    k = 3  # рисуем втрое крупнее и уменьшаем: края получаются гладкими
    s = size * k
    im = Image.new("RGB", (s, s), INK)
    d = ImageDraw.Draw(im)
    font = find_font(int(s * 0.62))
    d.text((s * 0.5, s * 0.47), "G", font=font, fill=PAPER, anchor="mm")
    # черта: плавная волна слева направо с круглыми концами
    w = int(s * 0.034)
    for x, y in bezier((s * 0.2, s * 0.795), (s * 0.36, s * 0.745), (s * 0.55, s * 0.835), (s * 0.8, s * 0.775), n=600):
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=PENCIL)  # штамп-кружки по кривой: ровный след без стыков
    return im.resize((size, size), Image.LANCZOS)


def square(im):
    """Картинка без прозрачности и строго квадратная (по центру)."""
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        base = Image.new("RGBA", im.size, INK + (255,))
        im = Image.alpha_composite(base, im)
    im = im.convert("RGB")
    w, h = im.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def edge_color(im):
    """Средний цвет краёв картинки: им заливается поле вокруг уменьшенного рисунка у maskable-значка."""
    small = im.resize((64, 64), Image.LANCZOS)
    px = [small.getpixel((i, j)) for i in range(64) for j in (0, 63)] + [small.getpixel((j, i)) for i in range(64) for j in (0, 63)]
    return tuple(sum(c[i] for c in px) // len(px) for i in range(3))


def maskable(im, size=512):
    canvas = Image.new("RGB", (size, size), edge_color(im))
    inner = int(size * 0.8)
    canvas.paste(im.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2, (size - inner) // 2))
    return canvas


def main():
    arg = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    if arg.exists():
        art = square(Image.open(arg))
        if art.size[0] < 512:
            print(f"Внимание: картинка маленькая ({art.size[0]} px). Для чёткого значка лучше от 1024 px.")
        print(f"значки из картинки: {arg}")
    else:
        art = placeholder()
        print("картинки нет: рисую временный значок «G»")
    OUT.mkdir(exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        art.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    maskable(art).save(OUT / "icon-maskable-512.png", optimize=True)
    print("готово:", ", ".join(sorted(f.name for f in OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
