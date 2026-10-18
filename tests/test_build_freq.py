"""Проверка сборщика частотного списка (tools/build_freq.py) на маленькой искусственной таблице Нейшна.

Запуск:  python3 -m unittest tests/test_build_freq.py -v
(Нужен только Python; сверка служебных слов с js/freqdeck.js выполняется, если установлен Node. Настоящий BNC_COCA_lists.xlsx
в тестах не нужен: таблица собирается тут же.)
"""
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
import build_freq as bf  # noqa: E402

HEADER = ["List ", "Headword ", "Related forms", "Total frequency"]


def make_xlsx(path: Path, rows: list[list], inline: bool = False) -> None:
    """Минимальный xlsx: один лист, текст в общей таблице строк (или прямо в ячейках, если inline)."""
    shared: list[str] = []

    def cell(ref: str, v) -> str:
        if isinstance(v, (int, float)):
            return f'<c r="{ref}"><v>{v}</v></c>'
        text = str(v).replace("&", "&amp;").replace("<", "&lt;")
        if inline:
            return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'
        shared.append(text)
        return f'<c r="{ref}" t="s"><v>{len(shared) - 1}</v></c>'

    body = ""
    for i, r in enumerate(rows, 1):
        body += f'<row r="{i}">' + "".join(cell(f"{'ABCD'[j]}{i}", v) for j, v in enumerate(r)) + "</row>"
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/workbook.xml", f'<workbook {ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml", f"<worksheet {ns}><sheetData>{body}</sheetData></worksheet>")
        if shared:
            z.writestr("xl/sharedStrings.xml", f"<sst {ns}>" + "".join(f"<si><t>{s}</t></si>" for s in shared) + "</sst>")


def fam(k, head, total, forms=None):
    return [f"{k}k", head, forms or f"{head} ({total})", total]


class FunctionWords(unittest.TestCase):
    def test_list_is_read_from_the_app_source(self):
        stop = bf.function_words()
        for x in ("the", "of", "and", "but", "be", "have", "will", "not", "one", "oh"):
            self.assertIn(x, stop)
        for x in ("time", "people", "like", "need", "work"):
            self.assertNotIn(x, stop)

    def test_same_as_what_javascript_sees(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node не установлен")
        out = subprocess.run(
            [node, "--input-type=module", "-e", "import('./js/freqdeck.js').then(m => console.log(JSON.stringify([...m.FUNCTION_WORDS])))"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
        self.assertEqual(set(json.loads(out)), bf.function_words())

    def test_missing_markers_are_reported(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.js"
            p.write_text("const nothing = 1;", encoding="utf-8")
            with self.assertRaises(SystemExit):
                bf.function_words(p)


class Xlsx(unittest.TestCase):
    def test_rows_are_read_with_shared_and_inline_strings(self):
        rows = [HEADER, fam(1, "time", 900, "time (500), times (400)"), fam(1, "walk", 300, "walk (100), walked (200)")]
        with tempfile.TemporaryDirectory() as d:
            for inline in (False, True):
                p = Path(d) / f"t{inline}.xlsx"
                make_xlsx(p, rows, inline)
                got = bf.read_xlsx(p)
                self.assertEqual(got[0], HEADER)
                self.assertEqual(got[1], ["1k", "time", "time (500), times (400)", "900"])
                self.assertEqual(len(got), 3)

    def test_families_are_parsed(self):
        rows = [HEADER, ["2k", " Walk ", "walk (100), walked (200), walking (50)", 350], ["", "", "", ""], ["total", "x", "x (1)", 1]]
        out = bf.read_families(rows)
        self.assertEqual(len(out), 1, "заголовок, пустая и чужая строки пропускаются")
        f = out[0]
        self.assertEqual((f["list"], f["head"], f["total"]), (2, "walk", 350))
        self.assertEqual(f["members"], [("walk", 100), ("walked", 200), ("walking", 50)])

    def test_total_is_summed_when_missing(self):
        out = bf.read_families([["1k", "time", "time (5), times (4)", ""]])
        self.assertEqual(out[0]["total"], 9)


class Picking(unittest.TestCase):
    families = [
        {"list": 2, "head": "walk", "total": 50, "members": []},
        {"list": 1, "head": "time", "total": 90, "members": []},
        {"list": 1, "head": "the", "total": 9999, "members": []},
        {"list": 1, "head": "people", "total": 95, "members": []},
        {"list": 1, "head": "0", "total": 80, "members": []},
        {"list": 1, "head": "to-be", "total": 70, "members": []},
        {"list": 2, "head": "work", "total": 50, "members": []},
        {"list": 3, "head": "ghost", "total": 5, "members": []},
        {"list": 1, "head": "time", "total": 10, "members": []},
    ]

    def test_order_is_by_list_then_family_frequency(self):
        got = bf.pick_words(self.families, bf.function_words())
        self.assertEqual(got, [("people", 1), ("time", 1), ("walk", 2), ("work", 2), ("ghost", 3)], "при равной частоте по алфавиту, повтор слова убран")

    def test_function_words_and_non_words_are_skipped(self):
        words = [w for w, _ in bf.pick_words(self.families, bf.function_words())]
        for bad in ("the", "0", "to-be"):
            self.assertNotIn(bad, words)

    def test_only_the_asked_lists_are_taken(self):
        self.assertEqual([w for w, _ in bf.pick_words(self.families, set(), lists=1)], ["the", "people", "time"])
        self.assertEqual({n for _, n in bf.pick_words(self.families, set(), lists=2)}, {1, 2})


class Output(unittest.TestCase):
    def table(self, d, per_list=950, lists=2):
        letters = lambda n: "".join(chr(97 + int(c)) for c in f"{n:04d}")  # noqa: E731  (слово из одних букв, как в настоящем списке)
        rows = [HEADER]
        for k in range(1, lists + 1):
            rows += [fam(k, f"w{letters(k)}x{letters(i)}", 1000 - i) for i in range(per_list)]
        rows.append(fam(1, "the", 99999))
        p = Path(d) / "lists.xlsx"
        make_xlsx(p, rows)
        return p

    def test_file_format(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "freq.json"
            bf.write(out, ["time", "people"])
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data["words"], ["time", "people"])
            self.assertEqual((data["v"], data["src"], data["size"]), (1, "nation-bnc-coca", 2))
            self.assertRegex(data["built"], r"^\d{4}-\d{2}-\d{2}$")

    def test_whole_build(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "freq.json"
            self.assertEqual(bf.main([str(self.table(d)), "--lists", "2", "--out", str(out)]), 0)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(len(data["words"]), 1900, "по 950 семей из двух списков, служебное the не попало")
            self.assertNotIn("the", data["words"])
            self.assertEqual(data["words"][0], "waaabxaaaa", "первым идёт самое частое слово первого списка")
            self.assertEqual(len(set(data["words"])), len(data["words"]))

    def test_wrong_table_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "small.xlsx"
            make_xlsx(p, [HEADER, fam(1, "time", 5)])
            with self.assertRaises(SystemExit) as ctx:
                bf.main([str(p), "--out", str(Path(d) / "freq.json")])
            self.assertIn("не те данные", str(ctx.exception))

    def test_missing_table_is_reported(self):
        with self.assertRaises(SystemExit) as ctx:
            bf.main(["/nonexistent/BNC_COCA_lists.xlsx"])
        self.assertIn("BNC_COCA_lists.xlsx", str(ctx.exception))

    def test_shipped_list_is_valid(self):
        data = json.loads((ROOT / "data" / "freq.json").read_text(encoding="utf-8"))
        self.assertEqual(data["v"], 1)
        words = data["words"]
        self.assertIsInstance(words, list)
        self.assertTrue(all(isinstance(x, str) for x in words))
        if not words:
            self.skipTest("в репозитории заглушка")
        self.assertEqual(data["src"], "nation-bnc-coca")
        self.assertGreaterEqual(len(words), 11000, "десять тысяч и запас на слова без перевода")
        self.assertEqual(len(set(words)), len(words), "повторов нет")
        self.assertTrue(all(bf.PLAIN_RE.match(x) for x in words), "только простые слова из букв")
        self.assertFalse(set(words) & bf.function_words(), "служебных слов нет")
        self.assertEqual(data["size"], len(words))


if __name__ == "__main__":
    unittest.main()
