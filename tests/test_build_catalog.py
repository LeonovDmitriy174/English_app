"""Проверка сборки каталога встроенных книг (tools/build_catalog.py) на маленьких EPUB, собранных прямо в тесте.

Запуск:  python3 -m unittest tests/test_build_catalog.py -v
"""
import base64
import contextlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_catalog as bc  # noqa: E402

# 1×1 PNG: достаточно, чтобы проверить, что обложка находится и копируется
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")

OPF2 = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
  {title}{author}{cover_meta}
 </metadata>
 <manifest>
  <item id="cov" href="img/cover%20art.png" media-type="image/png" {props}/>
  <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
 </manifest>
 <spine><itemref idref="c1"/></spine>
</package>"""


def make_epub(title="Alice", author="Lewis Carroll", cover="epub2", extra=""):
    """Минимальный EPUB. cover: 'epub2' (<meta name=cover>), 'epub3' (properties) или None."""
    opf = OPF2.format(
        title=f"<dc:title>{title}</dc:title>" if title else "",
        author=f"<dc:creator>{author}</dc:creator>" if author else "",
        cover_meta='<meta name="cover" content="cov"/>' if cover == "epub2" else "",
        props='properties="cover-image"' if cover == "epub3" else "",
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        z.writestr("OEBPS/content.opf", opf)
        z.writestr("OEBPS/c1.xhtml", f"<html><body><p>{extra}</p></body></html>")
        z.writestr("OEBPS/img/cover art.png", PNG)
    return buf.getvalue()


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.books = self.tmp / "books"
        self.books.mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def put(self, rel, data):
        p = self.books / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return p

    def build(self, **kw):
        return bc.build(self.books, **kw)

    def test_подпапки_лежат_внутри_встроенных_а_корень_это_default(self):
        self.put("root.epub", make_epub("Root Book", extra="r"))
        self.put("kids/alice.epub", make_epub("Alice", extra="a"))
        self.put("Классика/dracula.epub", make_epub("Dracula", "Bram Stoker", extra="d"))
        cat = self.build()["catalog"]
        self.assertEqual([g["name"] for g in cat["groups"]], ["Встроенные", "kids", "Классика"])
        self.assertEqual(cat["groups"][0]["id"], "s-default")
        self.assertEqual(cat["groups"][2]["id"], "s-классика")
        self.assertEqual([g["parent"] for g in cat["groups"]], ["", "s-default", "s-default"])
        by_title = {b["title"]: b for b in cat["books"]}
        self.assertEqual(by_title["Dracula"]["groups"], ["s-классика"])
        self.assertEqual(by_title["Dracula"]["author"], "Bram Stoker")
        self.assertEqual(by_title["Root Book"]["groups"], ["s-default"])
        self.assertEqual(by_title["Alice"]["file"], "kids/alice.epub")
        self.assertGreater(by_title["Alice"]["size"], 0)

    def test_названия_и_порядок_групп_из_groups_json(self):
        self.put("a/one.epub", make_epub("One", extra="1"))
        self.put("b/two.epub", make_epub("Two", extra="2"))
        self.put("one.epub", make_epub("Zero", extra="0"))
        (self.books / "groups.json").write_text(json.dumps({"b": "Детям", "default": "Для Сони"}, ensure_ascii=False), encoding="utf-8")
        cat = self.build()["catalog"]
        self.assertEqual([g["name"] for g in cat["groups"]], ["Для Сони", "Детям", "a"], "«Встроенные» первая, за ней вложенные в порядке groups.json")

    def test_groups_json_с_bom_из_блокнота_читается(self):
        self.put("kids/one.epub", make_epub("One"))
        (self.books / "groups.json").write_bytes("\ufeff".encode("utf-8") + json.dumps({"kids": "Детям"}, ensure_ascii=False).encode("utf-8"))
        self.assertEqual(self.build()["catalog"]["groups"][1]["name"], "Детям")

    def test_битый_groups_json_не_ломает_сборку(self):
        self.put("a/one.epub", make_epub("One"))
        (self.books / "groups.json").write_text("{не json", encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()):
            cat = self.build()["catalog"]
        self.assertEqual(cat["groups"][1]["name"], "a")

    def test_обложка_в_epub2_и_epub3_название_с_пробелом_в_пути(self):
        self.put("a/two.epub", make_epub("Two", cover="epub2", extra="2"))
        self.put("a/three.epub", make_epub("Three", cover="epub3", extra="3"))
        self.put("a/none.epub", make_epub("None", cover=None, extra="n"))
        cat = self.build()["catalog"]
        by = {b["title"]: b for b in cat["books"]}
        for t in ("Two", "Three"):
            self.assertTrue(by[t]["cover"].startswith("covers/c-"), t)
            self.assertTrue((self.books / by[t]["cover"]).is_file(), t)
        self.assertEqual(by["None"]["cover"], "")

    def test_без_pillow_маленькая_обложка_копируется_большая_пропускается(self):
        import unittest.mock as mock

        self.put("a/one.epub", make_epub("One", extra="1"))
        with mock.patch.dict(sys.modules, {"PIL": None}):
            b = self.build()["catalog"]["books"][0]
            self.assertTrue(b["cover"].endswith(".png"))
            self.assertIsNone(bc.make_cover(b"x" * (bc.RAW_COVER_LIMIT + 1), "image/jpeg"))
            self.assertIsNone(bc.make_cover(b"<svg/>", "image/svg+xml"))

    def test_нет_названия_берётся_имя_файла(self):
        self.put("a/the_secret_garden.epub", make_epub(title="", author="", cover=None))
        b = self.build()["catalog"]["books"][0]
        self.assertEqual(b["title"], "the secret garden")
        self.assertEqual(b["author"], "")

    def test_битый_файл_пропускается_с_предупреждением(self):
        self.put("a/good.epub", make_epub("Good"))
        self.put("a/bad.epub", b"this is not a zip")
        res = self.build()
        self.assertEqual([b["title"] for b in res["catalog"]["books"]], ["Good"])
        self.assertEqual(len(res["warnings"]), 1)
        self.assertIn("a/bad.epub", res["warnings"][0])

    def test_слишком_большой_файл_пропускается(self):
        self.put("a/big.epub", make_epub("Big"))
        old = bc.MAX_BOOK_BYTES
        bc.MAX_BOOK_BYTES = 100
        try:
            res = self.build()
        finally:
            bc.MAX_BOOK_BYTES = old
        self.assertEqual(res["catalog"]["books"], [])
        self.assertIn("90 МБ", res["warnings"][0])

    def test_один_и_тот_же_файл_в_двух_папках_это_одна_книга_в_двух_группах(self):
        data = make_epub("Twin", extra="same")
        self.put("kids/twin.epub", data)
        self.put("classics/twin-copy.epub", data)
        cat = self.build()["catalog"]
        self.assertEqual(len(cat["books"]), 1)
        self.assertEqual(sorted(cat["books"][0]["groups"]), ["s-classics", "s-kids"])

    def test_идентификатор_не_зависит_от_имени_файла(self):
        data = make_epub("Stable", extra="x")
        p = self.put("a/first.epub", data)
        first = self.build()["catalog"]["books"][0]["id"]
        p.rename(self.books / "a" / "renamed.epub")
        again = self.build()["catalog"]["books"][0]
        self.assertEqual(first, again["id"])
        self.assertEqual(again["file"], "a/renamed.epub")

    def test_старые_обложки_и_каталог_перезаписываются(self):
        self.put("a/one.epub", make_epub("One", extra="1"))
        self.build()
        stale = self.books / "covers" / "c-old.jpg"
        stale.write_bytes(b"x")
        self.build()
        self.assertFalse(stale.exists())
        self.assertEqual(len(json.loads((self.books / "catalog.json").read_text(encoding="utf-8"))["books"]), 1)

    def test_только_подпапки_встроенные_всё_равно_есть_как_родитель(self):
        self.put("kids/alice.epub", make_epub("Alice", extra="a"))
        cat = self.build()["catalog"]
        self.assertEqual([(g["id"], g["parent"]) for g in cat["groups"]], [("s-default", ""), ("s-kids", "s-default")])
        self.assertEqual(cat["books"][0]["groups"], ["s-kids"], "книга лежит во вложенной, не в корне")

    def test_пустая_подпапка_не_попадает_в_каталог(self):
        self.put("root.epub", make_epub("Root", extra="r"))
        (self.books / "empty").mkdir()
        self.put("bad/bad.epub", b"nope")
        with contextlib.redirect_stdout(io.StringIO()):
            cat = self.build()["catalog"]
        self.assertEqual([g["id"] for g in cat["groups"]], ["s-default"])

    def test_подпапка_глубже_одной_сплющивается_с_напоминанием(self):
        self.put("kids/fairy/tales/alice.epub", make_epub("Alice", extra="a"))
        self.put("kids/peter.epub", make_epub("Peter", extra="p"))
        res = self.build()
        by = {b["title"]: b for b in res["catalog"]["books"]}
        self.assertEqual(by["Alice"]["groups"], ["s-kids"])
        self.assertEqual(by["Alice"]["file"], "kids/fairy/tales/alice.epub")
        self.assertEqual(len(res["notices"]), 1)
        self.assertIn("kids/fairy/tales/alice.epub", res["notices"][0])
        self.assertEqual(res["warnings"], [], "книга не пропущена: напоминание не считается предупреждением")
        self.assertEqual(sorted(g["parent"] for g in res["catalog"]["groups"]), ["", "s-default"])

    def test_пустая_папка_даёт_пустой_каталог(self):
        cat = self.build()["catalog"]
        self.assertEqual(cat, {"groups": [], "books": []})

    def test_main_без_папки_не_падает_и_strict_ловит_пропущенные(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(bc.main([str(self.tmp / "нет-такой")]), 0)
            self.put("a/bad.epub", b"nope")
            self.assertEqual(bc.main([str(self.books)]), 0)
            self.assertEqual(bc.main([str(self.books), "--strict"]), 1)

    @unittest.skipUnless(shutil.which("node"), "нужен Node")
    def test_приложение_принимает_собранный_каталог(self):
        self.put("kids/alice.epub", make_epub("Alice", extra="a"))
        self.put("Классика/dracula.epub", make_epub("Dracula", extra="d"))
        self.put("root.epub", make_epub("Root", extra="r"))
        self.build()
        js = (
            "import {sanitizeCatalog} from %s; import fs from 'node:fs';"
            "const raw = JSON.parse(fs.readFileSync(%s, 'utf8')); const c = sanitizeCatalog(raw);"
            "console.log(JSON.stringify([raw.groups.length, c.groups.length, raw.books.length, c.books.length, c.books.every(b => b.groups.length > 0 && b.cover), JSON.stringify(c.groups.map(g => g.parent)) === JSON.stringify(raw.groups.map(g => g.parent))]))"
        ) % (json.dumps((ROOT / "js" / "shelf.js").as_uri()), json.dumps(str(self.books / "catalog.json")))
        out = subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True, check=True).stdout
        self.assertEqual(json.loads(out), [3, 3, 3, 3, True, True])


if __name__ == "__main__":
    unittest.main()
