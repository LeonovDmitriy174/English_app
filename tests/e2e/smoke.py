#!/usr/bin/env python3
"""Быстрая проверка приложения в настоящем браузере (Chromium, экран iPhone): открыть, прочитать, добавить слово, повторить.

Запуск (один раз: pip install playwright && playwright install chromium):
    python tests/e2e/smoke.py        или        npm run test:e2e

Файлы берутся из репозитория, словарь подменяется маленьким образцом (поэтому результат не зависит от вашего настоящего dict.json),
книга собирается тут же. Проверка не входит в npm test. Её же запускает GitHub Actions перед каждой публикацией (.github/workflows/pages.yml): если приложение
не открывается, сайт не обновляется. Локально это ваше «всё ли открывается» перед пушем.
"""
import functools
import html
import http.server
import json
import socketserver
import sys
import tempfile
import threading
import zipfile
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Нужен Playwright: pip install playwright && playwright install chromium")

ROOT = Path(__file__).resolve().parent.parent.parent
FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


DICT = [
    {"w": "wand", "t": "w", "pos": "noun", "ru": "палочка; жезл", "en": "a thin stick used for magic", "ex": "She waved her wand.", "z": 3.4},
    {"w": "castle", "t": "w", "pos": "noun", "ru": "замок", "en": "a large old building", "ex": "The castle stood on a hill.", "z": 4.5},
    {"w": "owl", "t": "w", "pos": "noun", "ru": "сова", "en": "a night bird", "ex": "An owl hooted outside.", "z": 3.6},
    {"w": "broom", "t": "w", "pos": "noun", "ru": "метла", "en": "a brush with a long handle", "ex": "He rode the broom.", "z": 3.2},
]
CHAPTERS = [
    ["The old castle stood on a hill, and an owl sat on the wand that nobody had touched for years.", "She picked up the broom and swept the floor of the castle while the owl watched her."] * 6,
    ["In the morning the wand glowed softly, and the owl flew away over the castle walls."] * 8,
]


def make_epub(path):
    items = "".join(f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(len(CHAPTERS)))
    spine = "".join(f'<itemref idref="c{i}"/>' for i in range(len(CHAPTERS)))
    opf = (
        '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="b"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
        "<dc:title>Smoke Book</dc:title><dc:creator>Test Author</dc:creator><dc:identifier id=\"b\">urn:uuid:smoke-book</dc:identifier><dc:language>en</dc:language></metadata>"
        f"<manifest>{items}</manifest><spine>{spine}</spine></package>"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        z.writestr("OEBPS/content.opf", opf)
        for i, ch in enumerate(CHAPTERS):
            body = "".join(f"<p>{html.escape(p)}</p>" for p in ch)
            z.writestr(f"OEBPS/c{i}.xhtml", f'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter {i + 1}</title></head><body><h2>Chapter {i + 1}</h2>{body}</body></html>')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    handler = functools.partial(Quiet, directory=str(ROOT))
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    book = Path(tempfile.mkdtemp()) / "smoke-book.epub"
    make_epub(book)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="ru-RU", service_workers="block")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/dict.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(DICT, ensure_ascii=False)))

        print("1. запуск")
        page.goto(url)
        page.wait_for_selector(".home .mark")
        check(page.title() == "Gloss", "заголовок страницы: Gloss")
        check(page.locator(".tab").count() == 5, "в нижней панели пять вкладок")

        print("2. книга: добавить и открыть")
        page.click(".tab:nth-child(2)")
        page.wait_for_selector(".empty, .f-link, .books")
        page.locator("input[type=file]").first.set_input_files([str(book)])
        page.wait_for_function("window.location.hash.startsWith('#/library') && document.querySelectorAll('.books .book-open, .f-link').length > 0", timeout=30000)
        page.evaluate("location.hash = '#/library/all'")
        page.wait_for_selector(".books .book-open")
        page.click(".books .book-open")
        page.wait_for_selector(".text p .w", timeout=20000)
        check("Chapter 1" in page.inner_text(".rtitle") or page.inner_text(".rtitle").strip() != "", "глава открылась")

        print("3. слово: нажать, добавить в словарь")
        page.locator(".text p .w", has_text="wand").first.click()
        page.wait_for_selector(".sheet.open .hw")
        check("палочка" in page.inner_text(".sheet.open"), "в карточке слова есть перевод")
        page.click(".sheet.open button:has-text('В словарь')")
        page.wait_for_selector(".sheet.open button:has-text('В словаре')")
        page.keyboard.press("Escape")
        page.wait_for_timeout(350)

        print("4. словарь и повторение")
        page.evaluate("location.hash = '#/dict'")
        page.wait_for_selector(".row-hw")
        check("wand" in page.inner_text(".rows"), "слово появилось в словаре")
        page.evaluate("location.hash = '#/review'")
        page.wait_for_selector("h1.title:has-text('Повторение')")
        check("К повторению" in page.inner_text(".lead"), "повторение видит карточку")
        page.click(".start-row .btn.primary")
        page.wait_for_selector(".rv-stage", timeout=10000)
        check(True, "заход начался")

        print("5. поиск и добавление слова без книги")
        page.evaluate("location.hash = '#/home'")
        page.wait_for_selector(".home .mark")
        page.click("button[aria-label='Добавить слово']")
        page.wait_for_selector(".sheet.addword.open .aw-input")
        page.fill(".aw-input", "castle")
        page.wait_for_selector(".hit .addbtn")
        page.click(".hit .addbtn")
        page.wait_for_selector(".hit .addbtn.saved")
        page.fill(".aw-input", "сова")
        page.wait_for_selector(".hit .row-hw:has-text('owl')", timeout=5000)
        check(True, "по-русски «сова» находит owl")
        page.keyboard.press("Escape")
        page.wait_for_timeout(350)

        print("6. главная, настройки, копия данных")
        check(page.inner_text(".h-ledger").find("Выучено слов") >= 0, "на главной есть итоги")
        page.click("button[aria-label='Настройки']")
        page.wait_for_selector(".sheet.open")
        page.keyboard.press("Escape")
        page.wait_for_timeout(350)
        data = json.loads(page.evaluate("import('/js/store.js').then((s) => s.exportData())"))
        check(data["app"] == "ember-chronicle-backup" and len(data["cards"]) == 2, f"копия данных читается, карточек: {len(data['cards'])}")
        check(errors == [], f"ошибок в странице нет: {errors}")
        browser.close()

    server.shutdown()
    print("\nПРОВАЛЕНО: " + "; ".join(FAILS) if FAILS else "\nВсё в порядке")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
