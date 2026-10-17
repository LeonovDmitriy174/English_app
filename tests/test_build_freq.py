"""Проверка сборщика частотного списка (tools/build_freq.py) на маленьком искусственном словаре.

Запуск:  python3 -m unittest tests/test_build_freq.py -v
(Нужен только Python; сверка служебных слов с js/freqdeck.js выполняется, если установлен Node. Библиотека wordfreq не нужна:
частоты в тестах подставляются словарём.)
"""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_freq as bf  # noqa: E402


def w(word, pos="noun", ru=None, **kw):
    e = {"w": word, "t": "w", "pos": pos, "en": f"a {word}"}
    if ru != "":
        e["ru"] = ru or f"перевод {word}"
    e.update(kw)
    return e


FREQ = {"walk": 5, "walks": 1, "walked": 2, "walking": 2, "time": 9, "times": 0.5, "work": 6, "worker": 4, "works": 1, "the": 100, "have": 80, "up": 50, "ghost": 7}
freq = lambda f: FREQ.get(f, 0.0)  # noqa: E731


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


class Pos(unittest.TestCase):
    def test_content_and_closed_classes(self):
        for p in ("noun", "verb", "adjective", "adverb", "noun, verb", "n", "adj", "preposition, adverb", ""):
            self.assertTrue(bf.is_content_pos(p), p)
        for p in ("preposition", "conjunction", "pronoun", "determiner", "article", "numeral", "interjection", "particle"):
            self.assertFalse(bf.is_content_pos(p), p)


class Ranking(unittest.TestCase):
    entries = [
        w("walk", "verb", f=["walked"]),
        w("time"),
        w("work", "verb"),
        w("worker"),
        w("the", "article"),
        w("have", "verb"),
        w("up", "preposition, adverb"),
        w("ghost", ru=""),  # перевода нет
        w("ghost2", rm="призрак", ru=""),
        w("of", "preposition"),
        {"w": "kick the bucket", "t": "id", "pos": "idiom", "ru": "умереть"},
    ]

    def ranked(self, **kw):
        return bf.rank_lemmas(self.entries, freq, bf.function_words(), **kw)

    def test_forms_are_summed_and_order_is_by_total(self):
        r = dict(self.ranked())
        # walk + walks + walked + walking (walked есть и среди правильных форм, и в записи: считается один раз)
        self.assertAlmostEqual(r["walk"], 10)
        self.assertLess(r["time"], r["walk"])
        self.assertEqual([x for x, _ in self.ranked()][:2], ["walk", "time"])

    def test_form_that_is_its_own_word_is_not_added(self):
        r = dict(self.ranked())
        # worker (4) отдельное слово, к work (6 + works 1) не прибавляется
        self.assertAlmostEqual(r["work"], 7)
        self.assertAlmostEqual(r["worker"], 4)

    def test_only_content_words_with_translation(self):
        words = [x for x, _ in self.ranked()]
        for bad in ("the", "have", "up", "of", "ghost", "kick the bucket"):
            self.assertNotIn(bad, words)
        self.assertNotIn("ghost2", words, "у слова без частоты в списке места нет")

    def test_size_and_ties(self):
        self.assertEqual(len(self.ranked(size=2)), 2)
        tied = [w("beta"), w("alpha")]
        out = bf.rank_lemmas(tied, lambda f: 1.0 if f in ("alpha", "beta") else 0.0, set())
        self.assertEqual([x for x, _ in out], ["alpha", "beta"], "при равной частоте по алфавиту: результат не зависит от порядка записей")


class Output(unittest.TestCase):
    def test_file_format(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "freq.json"
            bf.write(out, ["time", "people"])
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data["words"], ["time", "people"])
            self.assertEqual((data["v"], data["src"], data["size"]), (1, "wordfreq", 2))
            self.assertRegex(data["built"], r"^\d{4}-\d{2}-\d{2}$")

    def test_sample_dictionary_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "dict.json"
            src.write_text(json.dumps([w("time"), w("walk", "verb")]), encoding="utf-8")
            with self.assertRaises(SystemExit) as ctx:
                bf.main(["--dict", str(src), "--out", str(Path(d) / "freq.json")])
            self.assertIn("пробный образец", str(ctx.exception))

    def test_missing_dictionary_is_reported(self):
        with self.assertRaises(SystemExit):
            bf.main(["--dict", "/nonexistent/dict.json"])

    def test_shipped_placeholder_is_valid(self):
        data = json.loads((ROOT / "data" / "freq.json").read_text(encoding="utf-8"))
        self.assertEqual(data["v"], 1)
        self.assertIsInstance(data["words"], list)
        self.assertTrue(all(isinstance(x, str) for x in data["words"]))


if __name__ == "__main__":
    unittest.main()
