#!/usr/bin/env python3
"""Переводит на русский английские определения тех записей словаря, у которых нет русского перевода.

Зачем. В Викисловаре русские переводы есть не у всех слов, а у редких слов, которые встречаются в
сложных книгах, их чаще всего нет. Для таких записей здесь делается автоперевод ОПРЕДЕЛЕНИЯ
офлайн-моделью Opus-MT (Helsinki-NLP/opus-mt-en-ru). Приложение показывает его с пометкой
«автоперевод определения», рядом с английским определением. Если у слова есть настоящий перевод
из Викисловаря, он всегда главнее.

Запуск (один раз; модель скачивается один раз, потом всё работает без сети):
    pip install torch transformers sentencepiece sacremoses
    python tools/translate_glosses.py

Что делает:
  1. читает data/dict.json и находит записи без поля ru;
  2. переводит их определения пачками; каждая пачка сразу дописывается в data-src/mt-ru.jsonl, так что
     прерванный запуск (Ctrl+C, сон ноутбука) можно просто повторить: переведённое не пересчитывается;
  3. дописывает поле rm в data/dict.json.

Потом сделайте commit и push data/dict.json и data-src/mt-ru.jsonl. Кэш нужен, чтобы после следующей
пересборки словаря (build_dict.py) переводы вернулись сами, а переводились только новые определения.

Время: порядка 25–30 тысяч определений; на обычном ноутбуке без видеокарты 30–90 минут, с видеокартой
NVIDIA несколько минут. Пробный запуск: --limit 200.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_dict as bd  # noqa: E402

DEFAULT_MODEL = "Helsinki-NLP/opus-mt-en-ru"


class MarianTranslator:
    """Обёртка над MarianMT из библиотеки transformers."""

    def __init__(self, model: str = DEFAULT_MODEL, device: str = "auto", beams: int = 4):
        try:
            import torch
            from transformers import MarianMTModel, MarianTokenizer
        except ImportError:
            raise SystemExit("Нужны библиотеки: pip install torch transformers sentencepiece sacremoses")
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Загружаю модель {model} (при первом запуске скачается, около 300 МБ), устройство: {device}", file=sys.stderr)
        self.torch, self.device, self.beams = torch, device, beams
        self.tok = MarianTokenizer.from_pretrained(model)
        self.model = MarianMTModel.from_pretrained(model).to(device).eval()

    def translate(self, texts: list[str]) -> list[str]:
        batch = self.tok(texts, return_tensors="pt", padding=True, truncation=True, max_length=96).to(self.device)
        with self.torch.no_grad():
            out = self.model.generate(**batch, num_beams=self.beams, max_new_tokens=96)
        return self.tok.batch_decode(out, skip_special_tokens=True)


def pending(entries: list[dict], cache: dict[str, str]) -> list[str]:
    """Определения, которые ещё нужно перевести (короткие первыми: пачки выходят ровнее и быстрее)."""
    todo = {e["en"] for e in entries if not e.get("ru") and e.get("en") and e["en"] not in cache}
    return sorted(todo, key=lambda g: (len(g), g))


def run(entries, cache_path, translator, batch=32, limit=None, log=sys.stderr) -> tuple[int, int]:
    """Переводит недостающее, дописывая результат в кэш. -> (переведено, отбраковано)."""
    cache = bd.load_mt(cache_path)
    todo = pending(entries, cache)
    if limit:
        todo = todo[:limit]
    if not todo:
        print("Все определения уже переведены.", file=log)
        return 0, 0
    print(f"Определений к переводу: {len(todo):,}", file=log)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    good = bad = 0
    started = time.time()
    with open(cache_path, "a", encoding="utf-8") as f:
        for i in range(0, len(todo), batch):
            chunk = todo[i : i + batch]
            outs = translator.translate([bd.mt_source(g) for g in chunk])
            for g, raw in zip(chunk, outs):
                ru = bd.mt_clean(raw)
                ok = bd.mt_ok(g, ru)
                f.write(json.dumps({"en": g, "ru": ru if ok else ""}, ensure_ascii=False) + "\n")
                good += ok
                bad += not ok
            f.flush()
            done = i + len(chunk)
            if (i // batch) % 10 == 0 or done == len(todo):
                rate = done / max(time.time() - started, 1e-6)
                left = (len(todo) - done) / rate if rate else 0
                print(f"\r  {done:,} из {len(todo):,}, осталось примерно {int(left // 60)} мин", end="", file=log, flush=True)
    print(file=log)
    return good, bad


def main(argv=None, translator=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Автоперевод определений для записей без русского перевода")
    ap.add_argument("--dict", type=Path, default=bd.OUT, help="какой словарь дополнять (по умолчанию data/dict.json)")
    ap.add_argument("--cache", type=Path, default=bd.MT_CACHE, help="файл с готовыми переводами")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--device", default="auto", help="auto, cpu или cuda")
    ap.add_argument("--batch", type=int, default=32, help="сколько определений переводить за раз")
    ap.add_argument("--beams", type=int, default=4, help="ширина поиска: меньше быстрее (2), больше точнее")
    ap.add_argument("--limit", type=int, help="перевести только N определений (проба)")
    args = ap.parse_args(argv)

    if not args.dict.exists():
        raise SystemExit(f"Нет файла {args.dict}. Сначала соберите словарь: python tools/build_dict.py --wiktionary")
    entries = json.loads(args.dict.read_text(encoding="utf-8"))
    try:
        if pending(entries, bd.load_mt(args.cache)):
            translator = translator or MarianTranslator(args.model, args.device, args.beams)
        good, bad = run(entries, args.cache, translator, args.batch, args.limit)
    except KeyboardInterrupt:
        print("\nПрервано. Уже переведённое сохранено; повторите команду, чтобы продолжить.", file=sys.stderr)
        good = bad = 0
    mt = bd.load_mt(args.cache)
    for e in entries:
        e.pop("rm", None)
    got = bd.apply_mt(entries, mt)
    args.dict.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    left = sum(1 for e in entries if not e.get("ru") and not e.get("rm"))
    print(f"Готово: переведено {good:,}, отбраковано {bad:,}. Записей с автопереводом: {got:,}, совсем без перевода: {left:,}.")
    print(f"Словарь: {args.dict} ({args.dict.stat().st_size / 2**20:.1f} МБ). Кэш: {args.cache}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
