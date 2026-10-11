#!/usr/bin/env python3
"""Рисует иконки приложения (PNG) через headless Chromium из Playwright.
Запуск: python3 tools/make_icons.py
Иконка: тёмная «бумага» чернил, буква E с красным карандашным подчёркиванием.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

SVG = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{s}" height="{s}">
  <rect width="512" height="512" fill="#1b2231"/>
  <text x="256" y="338" text-anchor="middle" font-family="'Iowan Old Style','Charter','Georgia','DejaVu Serif',serif"
        font-weight="700" font-size="300" fill="#f4f5f0">E</text>
  <path d="M146 388 Q 256 372 366 388" stroke="#e0584a" stroke-width="14" stroke-linecap="round" fill="none"/>
</svg>
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        page = browser.new_page(viewport={"width": size, "height": size})
        page.set_content(f"<body style='margin:0'>{SVG.format(s=size)}</body>")
        page.screenshot(path=str(OUT / name))
        page.close()
    browser.close()
print("иконки готовы:", ", ".join(sorted(f.name for f in OUT.glob("*.png"))))
