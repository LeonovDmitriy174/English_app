"""Проверка сборщика словаря на маленьком искусственном «дампе» в формате wiktextract.

Запуск:  python3 -m unittest tests/test_build_dict.py -v
(Нужен только Python; проверка совместимости с lex.js выполняется, если установлен Node.)
"""
import gzip
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_dict as bd  # noqa: E402


def tr(word, code="ru", **kw):
    return {"lang_code": code, "lang": "Russian" if code == "ru" else "German", "word": word, **kw}


def sense(gloss, tags=None, ex=None, **kw):
    s = {"glosses": [gloss]}
    if tags:
        s["tags"] = tags
    if ex:
        s["examples"] = [{"text": ex, "type": "example"}]
    s.update(kw)
    return s


def entry(word, pos, senses, **kw):
    return {"word": word, "lang_code": "en", "lang": "English", "pos": pos, "senses": senses, **kw}


ZIPF = {"zzyzx": 0.0, "gleam": 2.6, "wand": 3.5, "obscure": 2.0, "well-known": 4.2}
zipf = lambda text: ZIPF.get(text, 4.5)  # noqa: E731

DUMP = [
    entry("dog", "noun", [sense("A domesticated mammal kept as a pet", ex="The dog barked at the postman.")],
          translations=[tr("соба́ка"), tr("пёс"), tr("Hund", "de"), tr("кобель", tags=["obsolete"])],
          forms=[{"form": "dogs", "tags": ["plural"]}, {"form": "no-table-tags", "tags": ["table-tags"]}]),
    entry("bank", "noun", [sense("A financial institution")], translations=[
        tr("банк", sense="financial institution"), tr("банковское учреждение", sense="financial institution"), tr("кредитная организация", sense="financial institution"),
        tr("берег", sense="edge of a river"), tr("откос", sense="edge of a river"), tr("ряд", sense="row"),
    ]),
    entry("light", "noun", [sense("Electromagnetic radiation visible to the eye", translations=[tr("свет"), tr("свет")])], ),
    entry("light", "adj", [sense("Not heavy", translations=[tr("лёгкий")])]),
    entry("light", "verb", [sense("To ignite", tags=["transitive"], translations=[tr("зажигать")])], forms=[{"form": "lit", "tags": ["past"]}]),
    entry("leave", "verb", [sense("To go away from", tags=["transitive"], ex="Please leave the room quietly.")],
          translations=[{"code": "ru", "lang": "Russian", "word": "уходить"}, tr("оставлять")],
          forms=[{"form": "left", "tags": ["past"]}, {"form": "leaves", "tags": ["present"]}, {"form": "leaving", "tags": ["participle"]}]),
    entry("left", "adj", [sense("On the west side when facing north")], translations=[tr("ле́вый")]),
    entry("left", "verb", [sense("simple past and past participle of leave", form_of=[{"word": "leave"}], tags=["form-of"])]),
    entry("go", "verb", [sense("To move")], translations=[tr("идти")],
          forms=[{"form": "went", "tags": ["past"]}, {"form": "gone", "tags": ["participle"]}, {"form": "going", "tags": ["participle"]}, {"form": "goes", "tags": ["present"]}]),
    entry("went", "verb", [sense("simple past of go", form_of=[{"word": "go"}], tags=["form-of"])]),
    entry("dogs", "noun", [sense("plural of dog", form_of=[{"word": "dog"}])]),
    entry("give up", "verb", [sense("To surrender", tags=["transitive"], translations=[tr("сдаваться")])], categories=[{"name": "English phrasal verbs", "kind": "other"}]),
    entry("look after", "verb", [sense("To take care of")], categories=["English phrasal verbs"], translations=[tr("присматривать")]),
    entry("kick the bucket", "verb", [sense("To die", tags=["idiomatic"])], categories=["English idioms"], translations=[tr("умереть")]),
    entry("take someone's mind off", "verb", [sense("To distract")], categories=["English idioms"]),
    entry("a (little) bird told me", "phrase", [sense("Used when you will not say who told you")], categories=["English idioms"]),
    entry("well-known", "adj", [sense("Widely known")], translations=[tr("известный")]),
    entry("Harry", "name", [sense("A male given name")]),
    entry("London", "name", [sense("The capital of England")]),
    entry("colour", "noun", [sense("Alternative spelling of color", alt_of=[{"word": "color"}])]),
    entry("at once", "adv", [sense("Immediately")], translations=[tr("сразу")]),
    entry("ice cream", "noun", [sense("A frozen dessert")], translations=[tr("мороженое")]),
    entry("I", "pron", [sense("The speaker or writer")], translations=[tr("я")]),
    entry("a", "article", [sense("Indefinite article")], translations=[tr("один")]),
    entry("zzyzx", "noun", [sense("A made-up rare word")], translations=[tr("что-то")]),
    entry("wand", "noun", [sense("A thin rod used for magic")]),
    entry("gleam", "noun", [sense("A faint light")]),
    entry("obscure", "adj", [sense("Not clear")], translations=[tr("неясный")]),
    {"word": "chien", "lang_code": "fr", "lang": "French", "pos": "noun", "senses": [sense("dog")], "translations": [tr("dog", "en")]},
    {"word": "dog", "lang_code": "en", "redirect": "Dog"},
]


words = lambda rec: [w for _, w in rec["ru"]]  # noqa: E731


def find(word, pos=None):
    return next(o for o in DUMP if o["word"] == word and (pos is None or o.get("pos") == pos))


class ReadEntry(unittest.TestCase):
    def test_non_english_ignored(self):
        self.assertIsNone(bd.read_entry(find("chien")))
        self.assertIsNone(bd.read_entry({"word": "dog", "lang_code": "en", "redirect": "Dog"}))

    def test_russian_cleaning(self):
        rec = bd.read_entry(find("dog", "noun"))
        self.assertEqual(words(rec), ["собака", "пёс"])  # без ударения, без немецкого и устаревшего

    def test_both_translation_layouts(self):
        self.assertEqual(words(bd.read_entry(find("light", "noun"))), ["свет", "свет"])  # внутри значения
        self.assertEqual(words(bd.read_entry(find("leave"))), ["уходить", "оставлять"])  # ключ code вместо lang_code

    def test_categories_both_shapes(self):
        self.assertIn("English phrasal verbs", bd.read_entry(find("give up"))["cats"])
        self.assertIn("English phrasal verbs", bd.read_entry(find("look after"))["cats"])

    def test_form_of_is_not_a_plain_sense(self):
        rec = bd.read_entry(find("left", "verb"))
        self.assertEqual(rec["senses"], [])
        self.assertEqual(rec["form_lemmas"], {"leave"})


class Patterns(unittest.TestCase):
    def test_placeholders(self):
        self.assertEqual(bd.patterns("take someone's mind off", "verb"), ["take @ mind off"])
        self.assertEqual(bd.patterns("give someone a hand"), ["give * a hand"])
        self.assertEqual(bd.patterns("to be on the safe side", "verb"), ["be on the safe side"])
        self.assertEqual(bd.patterns("to and fro"), ["to and fro"])  # у не-глагола «to» не отбрасывается

    def test_optional_parts(self):
        self.assertEqual(bd.patterns("a (little) bird told me"), ["a little bird told me", "a bird told me"])

    def test_rejects(self):
        self.assertIsNone(bd.patterns("so far, so good"))
        self.assertIsNone(bd.patterns("his/her majesty"))
        self.assertIsNone(bd.patterns("someone else"))  # нет двух настоящих слов
        self.assertIsNone(bd.patterns("someone's own"))  # начинается с подстановки

    def test_hyphens(self):
        self.assertEqual(bd.patterns("make-believe"), ["make believe"])


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hand = [{"w": "kick the bucket", "t": "id", "pos": "idiom", "ru": "сыграть в ящик", "en": "to die", "ex": "He kicked the bucket."}]
        b = bd.Builder(zipf, min_zipf=2.4, min_zipf_noru=3.0)
        for o in DUMP:
            b.consume(o)
        cls.b = b
        cls.items = {(e["t"], e["w"]): e for e in b.finish(cls.hand)}

    def test_basic_word(self):
        e = self.items[("w", "dog")]
        self.assertEqual(e["ru"], "собака, пёс")
        self.assertEqual(e["pos"], "noun")
        self.assertEqual(e["ex"], "The dog barked at the postman.")
        self.assertNotIn("f", e)  # dogs получается по правилам

    def test_meanings_are_kept_apart(self):
        # по два варианта на смысл, смыслы через «; », всего не больше четырёх на часть речи
        self.assertEqual(self.items[("w", "bank")]["ru"], "банк, банковское учреждение; берег, откос")

    def test_merged_parts_of_speech(self):
        e = self.items[("w", "light")]
        self.assertEqual(e["pos"], "noun, adjective, verb")
        self.assertEqual(e["ru"], "свет; лёгкий; зажигать")
        self.assertEqual(e["en"], "Electromagnetic radiation visible to the eye")

    def test_irregular_forms_and_homographs(self):
        self.assertEqual(self.items[("w", "go")]["f"], ["went", "gone"])
        self.assertNotIn("f", self.items[("w", "leave")])  # left — самостоятельное слово, leaves/leaving — по правилам
        self.assertEqual(self.items[("w", "left")]["of"], ["leave"])
        self.assertEqual(self.items[("w", "left")]["ru"], "левый")
        self.assertNotIn(("w", "went"), self.items)
        self.assertNotIn(("w", "dogs"), self.items)

    def test_phrasal_verbs(self):
        e = self.items[("pv", "give up")]
        self.assertEqual(e["ru"], "сдаваться")
        self.assertTrue(e["sep"])
        self.assertFalse(self.items[("pv", "look after")].get("sep"))  # предлог, а не частица

    def test_idioms(self):
        self.assertEqual(self.items[("id", "kick the bucket")]["ru"], "сыграть в ящик")  # ручная запись главнее
        e = self.items[("id", "take someone's mind off")]
        self.assertEqual(e["m"], ["take @ mind off"])
        self.assertNotIn("ru", e)
        self.assertEqual(e["en"], "To distract")
        self.assertEqual(self.items[("id", "a (little) bird told me")]["m"], ["a little bird told me", "a bird told me"])

    def test_fixed_phrase_and_compounds(self):
        self.assertEqual(self.items[("id", "at once")]["ru"], "сразу")
        self.assertNotIn(("w", "ice cream"), self.items)
        self.assertNotIn(("id", "ice cream"), self.items)
        self.assertEqual(self.items[("w", "well-known")]["m"], ["well known"])

    def test_skipped(self):
        for key in [("w", "harry"), ("w", "london"), ("w", "colour"), ("w", "zzyzx"), ("w", "chien")]:
            self.assertNotIn(key, self.items)

    def test_frequency_thresholds(self):
        self.assertIn(("w", "wand"), self.items)  # без перевода, но частотное
        self.assertNotIn("ru", self.items[("w", "wand")])
        self.assertNotIn(("w", "gleam"), self.items)  # без перевода и редкое
        self.assertNotIn(("w", "obscure"), self.items)  # слишком редкое даже с переводом

    def test_single_letters(self):
        self.assertIn(("w", "i"), self.items)
        self.assertIn(("w", "a"), self.items)

    def test_diagnostics(self):
        self.assertEqual(self.b.cat_probe["English idioms"], 3)
        self.assertEqual(self.b.cat_probe["English phrasal verbs"], 2)


class EndToEnd(unittest.TestCase):
    def test_cli_and_app_compatibility(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            src = tmp / "dump.jsonl.gz"
            with gzip.open(src, "wt", encoding="utf-8") as f:
                for o in DUMP:
                    f.write(json.dumps(o, ensure_ascii=False) + "\n")
            out = tmp / "dict.json"
            code = bd.main(["--wiktionary", "--source", str(src), "--no-freq", "--out", str(out), "--cache", str(tmp / "cache")])
            self.assertEqual(code, 0)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data, sorted(data, key=lambda e: (e["t"], e["w"])))
            node = shutil.which("node")
            if not node:
                self.skipTest("Node не найден: пропускаю проверку совместимости с lex.js")
            script = (ROOT / "tests" / "dict_compat.mjs").resolve()
            res = subprocess.run([node, str(script), str(out)], capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class CacheFlow(unittest.TestCase):
    """Без --source: сначала дамп из кэша, из него выбираются английские статьи, повторный запуск берёт готовый кэш."""

    def test_extract_then_reuse_and_probe(self):
        import contextlib
        import io

        tmp = Path(tempfile.mkdtemp())
        try:
            cache = tmp / "cache"
            cache.mkdir()
            noise = {"word": "хлеб", "lang_code": "ru", "lang": "Russian", "pos": "noun", "senses": [], "translations": [{"lang_code": "en", "word": "bread"}]}
            with gzip.open(cache / bd.DUMP_NAME, "wt", encoding="utf-8") as f:
                for o in [noise] + DUMP:
                    f.write(json.dumps(o, ensure_ascii=False) + "\n")
            out = tmp / "dict.json"
            args = ["--wiktionary", "--no-freq", "--cache", str(cache), "--out", str(out)]
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(bd.main(args), 0)
            self.assertTrue((cache / bd.ENGLISH_NAME).exists())
            first = out.read_text(encoding="utf-8")
            (cache / bd.DUMP_NAME).unlink()  # дамп больше не нужен: хватает кэша
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(bd.main(args), 0)
            self.assertEqual(out.read_text(encoding="utf-8"), first)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(bd.main(["--probe", "give up", "--cache", str(cache)]), 0)
            self.assertIn("English phrasal verbs", buf.getvalue())
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
