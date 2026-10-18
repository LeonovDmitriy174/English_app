#!/usr/bin/env python3
"""Устойчивость в настоящем браузере: испорченные EPUB, испорченные записи в базе, испорченные копии данных, упавший экран.

Запуск (один раз: pip install playwright && playwright install chromium):
    python tests/e2e/robust.py        или        npm run test:robust

Это вторая проверка рядом с smoke.py: та смотрит, что приложение работает, когда всё в порядке, эта — что оно остаётся живым, когда не в порядке.
Ничего не должно ломаться: либо понятное сообщение, либо исправленная запись, но не пустой экран и не необработанная ошибка.
Её же запускает GitHub Actions перед каждой публикацией (.github/workflows/pages.yml).
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
]
CONT = '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'


def opf(title="Evil", spine=("c0",)):
    items = "".join(f'<item id="{i}" href="{i}.xhtml" media-type="application/xhtml+xml"/>' for i in spine)
    refs = "".join(f'<itemref idref="{i}"/>' for i in spine)
    return (
        '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="b"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
        f'<dc:title>{title}</dc:title><dc:creator>X</dc:creator><dc:identifier id="b">urn:x:{title}</dc:identifier><dc:language>en</dc:language></metadata><manifest>{items}</manifest><spine>{refs}</spine></package>'
    )


def page(body):
    return f'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>{body}</body></html>'


def write_epub(path, files):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)


def make_evil(folder):
    """Испорченные EPUB: имя → (путь, что должно произойти: 'reject' — понятное сообщение и книги нет, 'accept' — книга добавлена)."""
    out = {}
    good = folder / "good.epub"
    sentence = "The old castle stood on a hill and an owl sat on the wand. "
    write_epub(good, {"META-INF/container.xml": CONT, "OEBPS/content.opf": opf("Good Book"), "OEBPS/c0.xhtml": page("<h2>One</h2>" + f"<p>{sentence * 4}</p>" * 8)})
    data = good.read_bytes()

    def raw(name, content):
        p = folder / name
        p.write_bytes(content)
        out[name] = (p, "reject")

    raw("empty.epub", b"")
    raw("not-a-zip.epub", b"This is not a zip file at all. " * 100)
    raw("truncated.epub", data[: len(data) // 2])
    raw("tiny.epub", b"PK\x03\x04")
    bad = bytearray(data)  # смещение каталога за пределами файла
    i = bad.rfind(b"PK\x05\x06")
    bad[i + 16 : i + 20] = (len(data) + 5000).to_bytes(4, "little")
    raw("bad-offset.epub", bytes(bad))

    def zipped(name, files, verdict="reject"):
        p = folder / name
        write_epub(p, files)
        out[name] = (p, verdict)

    zipped("no-container.epub", {"mimetype": "application/epub+zip", "OEBPS/c0.xhtml": page("<p>Hello</p>")})
    zipped("missing-opf.epub", {"META-INF/container.xml": CONT, "OEBPS/c0.xhtml": page("<p>Hello</p>")})
    zipped("empty-spine.epub", {"META-INF/container.xml": CONT, "OEBPS/content.opf": opf(spine=()), "OEBPS/c0.xhtml": page("<p>Hello</p>")})
    zipped("broken-xml.epub", {"META-INF/container.xml": CONT, "OEBPS/content.opf": "<package><manifest><item id='c0' href='c0.xhtml'", "OEBPS/c0.xhtml": "<p>x"})
    # «бомба»: 40 МБ текста в одной главе сжимаются примерно до 40 КБ
    zipped("bomb.epub", {"META-INF/container.xml": CONT, "OEBPS/content.opf": opf("Bomb"), "OEBPS/c0.xhtml": page("<p>" + ("a " * 20_000_000) + "</p>")})
    # глава длиннее допустимого (около 2,5 млн знаков)
    zipped("too-long-chapter.epub", {"META-INF/container.xml": CONT, "OEBPS/content.opf": opf("Long"), "OEBPS/c0.xhtml": page("<p>" + ("word " * 520_000) + "</p>")})
    # странные, но допустимые: вложенность, сущности, управляющие знаки
    zipped("nesting.epub", {"META-INF/container.xml": CONT, "OEBPS/content.opf": opf("Nest"), "OEBPS/c0.xhtml": page("<div>" * 3000 + "word " * 400 + "</div>" * 3000)}, "accept")
    zipped("entities.epub", {"META-INF/container.xml": CONT, "OEBPS/content.opf": opf("Ent &amp; <b>x</b>"), "OEBPS/c0.xhtml": page("<p>&nbsp;&#0;&#xD800;&bogus; abc \u0000 </p>" + "<p>word </p>" * 400)}, "accept")
    return good, out


# Записи, которых приложение само не пишет: прежние версии, оборванная запись, ручная правка
SEED_JS = """async (seed) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('ember', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('books', {keyPath:'id'}); d.createObjectStore('files', {keyPath:'id'}); d.createObjectStore('cards', {keyPath:'id'}); d.createObjectStore('log', {autoIncrement:true}); d.createObjectStore('kv', {keyPath:'key'}); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const t = db.transaction(['books','cards','kv','log'], 'readwrite');
    for (const [store, rows] of Object.entries(seed)) for (const v of rows) t.objectStore(store).put(v);
    t.oncomplete = res; t.onerror = () => rej(t.error); });
  db.close();
}"""
NOW = 1792300000000
SEED = {
    "cards": [
        {"id": "w:garbage1"},
        {"id": "w:garbage2", "srs": None, "w": None},
        {"id": "w:garbage3", "srs": {"lv": "x", "due": "never", "reps": -5}, "w": 5, "t": "w"},
        {"id": "w:garbage4", "srs": {"lv": 99, "due": 1e300, "last": "yesterday"}, "w": "ghost", "t": "w"},
        {"id": "w:garbage5", "fsrs": {"state": "x", "due": "bad"}, "w": "ghost2", "t": "w"},
        {"id": "pv:garbage6", "srs": {"lv": 3, "due": NOW}, "w": [], "t": "pv"},
        {"id": "w:ok", "srs": {"lv": 2, "due": NOW - 1000, "last": NOW - 99999, "reps": 4, "lapses": 1, "v": 3}, "w": "ok", "t": "w"},
    ],
    "books": [
        {"id": "b-garbage1"},
        {"id": "b-garbage2", "title": 5, "author": ["x"], "chapters": "no", "progress": "50%", "added": "yesterday", "stats": "x"},
        {"id": "b-garbage3", "title": "Пустая", "chapters": [], "progress": {"ch": 7, "p": -3}, "added": NOW, "parser": 1},
        {"id": "b-garbage4", "title": "Без файла", "author": "A", "chapters": [{"href": "x.xhtml", "title": "T", "chars": 5}], "progress": {"ch": 0, "p": 9999}, "added": NOW, "parser": 3, "stats": {"sig": "v4.x", "tokens": "x", "top": 5}},
    ],
    "kv": [
        {"key": "settings", "value": "строка вместо объекта"},
        {"key": "daily", "value": 42},
        {"key": "notes", "value": {"a": 1}},
        {"key": "groups", "value": [None, 5, {}, {"id": "g1"}]},
        {"key": "catalog", "value": {"books": "x"}},
        {"key": "backup", "value": {"at": "вчера", "snoozeUntil": None}},
        {"key": "known", "value": [1, None, "ok", {}]},
        {"key": "activity", "value": "x"},
        {"key": "chars", "value": []},
    ],
    "log": [None, 5, "x", {"id": "w:ok"}, {"id": "w:ok", "t": "never", "r": 5}],
}
SCREENS = ["#/home", "#/library/all", "#/dict", "#/progress", "#/review", "#/phrases", "#/replenish", "#/notes", "#/read/b-garbage1", "#/read/b-garbage3", "#/read/b-garbage4", "#/read/nope", "#/bogus/route"]
TAG = "ember-chronicle-backup"
BAD_BACKUPS = {
    "не JSON": b"\x00\x01 not json {{{",
    "пустой файл": b"",
    "null": b"null",
    "массив": b"[1,2,3]",
    "чужой объект": b'{"cards": []}',
    "карточки-мусор": json.dumps({"app": TAG, "version": 4, "cards": [None, 5, "x", {}, {"id": 7}, {"id": "w:a", "srs": "bad"}, {"id": "w:b", "srs": {"lv": 4, "due": 1e300}, "w": "b", "t": "w"}], "log": "x", "notes": {"a": 1}, "settings": {"cap": "много", "theme": 99}}).encode(),
    "огромные числа": json.dumps({"app": TAG, "cards": [{"id": "w:z", "srs": {"lv": 1e308, "due": -1e308, "reps": 1e20}, "w": "z", "t": "w"}], "settings": {"reviewCap": 1e9, "newPerDay": -4}}).encode(),
    "глубокая вложенность": b"[" * 5000 + b"]" * 5000,
}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def go(page, hash_):
    page.evaluate("(h) => { location.hash = h }", hash_)
    page.wait_for_timeout(700)


def new_page(browser, errors, **kw):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="ru-RU", service_workers="block", **kw)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/dict.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(DICT, ensure_ascii=False)))
    return ctx, page


def main():
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    tmp = Path(tempfile.mkdtemp())
    good, evil = make_evil(tmp)

    with sync_playwright() as p:
        browser = p.chromium.launch()

        print("1. испорченные EPUB: понятное сообщение, приложение живо")
        errors = []
        ctx, page = new_page(browser, errors)
        crashed = []
        page.on("crash", lambda: crashed.append(1))
        page.goto(url + "#/library/all")
        page.wait_for_selector(".empty, .books")
        for name, (path, verdict) in evil.items():
            before = page.locator(".book").count()
            page.set_input_files("input[type=file]", str(path))
            page.wait_for_function("(n) => document.querySelectorAll('.book').length > n || (document.querySelector('.toast') && !/Читаю/.test(document.querySelector('.toast').innerText))", arg=before, timeout=40000)
            page.wait_for_timeout(500)
            toast = page.locator(".toast").first.inner_text() if page.locator(".toast").count() else ""
            added = page.locator(".book").count() - before
            if verdict == "reject":
                check(added == 0 and len(toast) > 10 and "Читаю" not in toast, f"{name}: книга не добавлена, сообщение: «{toast[:70]}»")
            else:
                check(added == 1, f"{name}: книга добавлена")
            page.wait_for_timeout(200)
        check(not crashed and not errors, f"ни одна страница не упала, необработанных ошибок нет {errors[:2]}")
        before = page.locator(".book").count()
        page.set_input_files("input[type=file]", str(good))
        page.wait_for_function("(n) => document.querySelectorAll('.book').length > n", arg=before, timeout=30000)
        page.locator(".book-open").last.click()
        page.wait_for_selector(".text .w", timeout=20000)
        check(True, "после всего хорошая книга импортируется и открывается")
        ctx.close()

        print("2. испорченные записи в базе: все экраны открываются")
        errors = []
        ctx, page = new_page(browser, errors)
        page.goto(url + "#/home")
        page.wait_for_timeout(1200)
        page.evaluate(SEED_JS, SEED)
        page.reload()
        page.wait_for_timeout(1500)
        check(not errors, f"приложение открылось с испорченной базой {errors[:2]}")
        for screen in SCREENS:
            errors.clear()
            go(page, screen)
            text = page.locator("#app").inner_text().strip()
            check(len(text) > 20 and not errors and "Не удалось открыть этот экран" not in text, f"экран {screen}: есть содержимое, без ошибок {errors[:1]}")
        logged = page.evaluate("localStorage.getItem('ember.errors') || ''")
        check(logged == "", f"в журнале ошибок приложения пусто ({logged[:120]})")
        ctx.close()

        print("3. испорченные копии данных: сообщение, окно настроек живо")
        errors = []
        ctx, page = new_page(browser, errors)
        page.goto(url + "#/home")
        page.wait_for_selector(".home .mark")
        for name, data in BAD_BACKUPS.items():
            f = tmp / f"backup-{abs(hash(name))}.json"
            f.write_bytes(data)
            errors.clear()
            go(page, "#/home")
            page.locator("button[aria-label='Настройки']").first.click()
            page.wait_for_timeout(400)
            page.set_input_files("input[aria-label='Файл резервной копии']", str(f))
            page.wait_for_timeout(900)
            toast = page.locator(".toast").first.inner_text() if page.locator(".toast").count() else ""
            check(not errors and len(toast) > 5, f"{name}: «{toast[:60]}»")
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)
        for screen in ["#/home", "#/review", "#/progress", "#/dict"]:
            go(page, screen)
        check(not errors, f"после всех копий экраны открываются {errors[:2]}")
        ctx.close()

        print("4. упавший экран: сообщение вместо пустоты")
        errors = []
        ctx, page = new_page(browser, errors)
        page.route("**/js/views/progress.js", lambda r: r.fulfill(content_type="text/javascript", body="export function renderProgress(){ throw new Error('boom-test') }"))
        page.goto(url + "#/home")
        page.wait_for_selector(".home .mark")
        page.locator("a.tab", has_text="Прогресс").click()
        page.wait_for_timeout(600)
        text = page.locator("#app").inner_text()
        check("Не удалось открыть этот экран" in text and "boom-test" in text, "на месте экрана сообщение с причиной")
        check(page.locator("a.tab").count() == 5, "вкладки на месте")
        page.locator("a.btn", has_text="На главную").click()
        page.wait_for_selector(".home .mark")
        check(True, "«На главную» возвращает работающую главную")
        ctx.close()

        print("5. хранилище недоступно: понятное сообщение")
        errors = []
        ctx, page = new_page(browser, errors)
        ctx.add_init_script("Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('denied', 'SecurityError'); } });")
        page.goto(url + "#/home")
        page.wait_for_timeout(1200)
        check("Не удалось открыть хранилище" in page.locator("body").inner_text(), "вместо пустого экрана написано, что хранилище не открылось")
        ctx.close()
        browser.close()

    server.shutdown()
    print()
    if FAILS:
        print(f"Не прошло проверок: {len(FAILS)}")
        for f in FAILS:
            print("  -", f)
        sys.exit(1)
    print("Всё хорошо.")


if __name__ == "__main__":
    main()
