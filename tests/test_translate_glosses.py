"""Проверка автоперевода определений на заглушке модели (настоящую модель в тестах не скачиваем).

Запуск:  python3 -m unittest tests/test_translate_glosses.py -v
"""
import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_dict as bd  # noqa: E402
import translate_glosses as tg  # noqa: E402


class Fake:
    """Вместо модели: «переводит» по словарю, остальное превращает в предсказуемую строку."""

    def __init__(self, table=None):
        self.calls = []
        self.table = table or {}

    def translate(self, texts):
        self.calls.append(list(texts))
        return [self.table.get(t, f"Определение номер {len(t)}") for t in texts]


ENTRIES = [
    {"w": "tantrum", "t": "w", "pos": "noun", "en": "a sudden angry outburst"},
    {"w": "dog", "t": "w", "pos": "noun", "ru": "собака", "en": "a domesticated mammal"},
    {"w": "wand", "t": "w", "pos": "noun", "en": "a thin rod used for magic"},
    {"w": "twin", "t": "w", "pos": "noun", "en": "a sudden angry outburst"},  # то же определение
    {"w": "kick the bucket", "t": "id", "pos": "verb", "en": "to die"},
]


class Helpers(unittest.TestCase):
    def test_source_and_clean(self):
        self.assertEqual(bd.mt_source("to ignite."), "To ignite")
        self.assertEqual(bd.mt_clean("Внезапная вспышка гнева."), "внезапная вспышка гнева")
        self.assertEqual(bd.mt_clean("Чтобы умереть"), "умереть")
        self.assertEqual(bd.mt_clean("США и Европа"), "США и Европа")  # аббревиатуру не портим

    def test_rejects_bad_output(self):
        self.assertFalse(bd.mt_ok("to die", ""))
        self.assertFalse(bd.mt_ok("to die", "to die"))  # не по-русски
        self.assertFalse(bd.mt_ok("to die", "умереть " * 5))  # зациклилась
        self.assertFalse(bd.mt_ok("to die", "очень длинный и совершенно ненужный ответ модели на два слова"))
        self.assertTrue(bd.mt_ok("a sudden angry outburst", "внезапная вспышка гнева"))


class Pipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.cache = self.tmp / "mt.jsonl"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_pending_skips_translated_and_duplicates(self):
        self.assertEqual(tg.pending(ENTRIES, {}), ["to die", "a sudden angry outburst", "a thin rod used for magic"])
        self.assertEqual(tg.pending(ENTRIES, {"to die": "умереть"}), ["a sudden angry outburst", "a thin rod used for magic"])

    def test_run_resume_and_rejects(self):
        fake = Fake({"To die": "Умереть.", "A thin rod used for magic": ""})
        with contextlib.redirect_stderr(io.StringIO()):
            good, bad = tg.run(ENTRIES, self.cache, fake, batch=2)
        self.assertEqual((good, bad), (2, 1))
        self.assertEqual([len(c) for c in fake.calls], [2, 1])  # пачки по два
        cache = bd.load_mt(self.cache)
        self.assertEqual(cache["to die"], "умереть")
        self.assertEqual(cache["a thin rod used for magic"], "")  # отбракованное запомнено
        again = Fake()
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(tg.run(ENTRIES, self.cache, again), (0, 0))
        self.assertEqual(again.calls, [])  # ничего не переводится повторно

    def test_cli_writes_rm_only_where_ru_is_missing(self):
        path = self.tmp / "dict.json"
        path.write_text(json.dumps(ENTRIES + [{"w": "x", "t": "w", "pos": "noun", "ru": "икс", "en": "x", "rm": "старое"}]), encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(tg.main(["--dict", str(path), "--cache", str(self.cache)], translator=Fake()), 0)
        data = {e["w"]: e for e in json.loads(path.read_text(encoding="utf-8"))}
        self.assertEqual(data["tantrum"]["rm"], "определение номер 23")
        self.assertEqual(data["twin"]["rm"], data["tantrum"]["rm"])
        self.assertNotIn("rm", data["dog"])
        self.assertNotIn("rm", data["x"])  # у записи с переводом лишнее убрано

    def test_builder_applies_cache(self):
        self.cache.write_text(json.dumps({"en": "to die", "ru": "умереть"}, ensure_ascii=False) + "\nмусор\n", encoding="utf-8")
        entries = json.loads(json.dumps(ENTRIES))
        self.assertEqual(bd.apply_mt(entries, bd.load_mt(self.cache)), 1)
        self.assertEqual(entries[4]["rm"], "умереть")


if __name__ == "__main__":
    unittest.main()
