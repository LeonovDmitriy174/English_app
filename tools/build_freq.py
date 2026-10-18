#!/usr/bin/env python3
"""Собирает частотный список для «Пополнить словарь»: data/freq.json.

Что это. Список содержательных слов (существительные, глаголы, прилагательные, наречия) от самых частых к более редким.
Приложение берёт из него слова для проверки знаний. Предлоги, союзы, местоимения, артикли, вспомогательные глаголы и т. п.
в список не попадают (их перечень лежит в js/freqdeck.js между маркерами FUNCTION-WORDS).

Как считается частота. Берётся ваш словарь (data/dict.json) и библиотека wordfreq. Частота слова это сумма частот его форм:
walk + walks + walked + walking (формы по правилам из build_dict.regular_forms и неправильные формы записи, поле f).
Форма, которая сама есть отдельным словом словаря (worker, hardly), к исходному слову не прибавляется. Слова с дефисом (is-a, to-be) и с апострофом (don't) в список не берутся: частота таких записей считается по входящим словам и выходит выше, чем у time или people.
Имён собственных,
сокращений и приставок в словаре нет (build_dict.py их не берёт), поэтому в списке их тоже нет. В список попадают только слова,
у которых в словаре есть перевод: любое слово из него можно спросить.

Запуск (после сборки словаря):
    pip install wordfreq
    python3 tools/build_freq.py
Готовый файл data/freq.json нужно закоммитить вместе с остальным. Если словарь пересобран, пересоберите и список.
Данные частот wordfreq распространяются на условиях CC BY-SA 4.0 (ссылка на источник есть в README).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_dict  # noqa: E402

DICT = ROOT / "data" / "dict.json"
OUT = ROOT / "data" / "freq.json"
JS = ROOT / "js" / "freqdeck.js"
# Пять тысяч и большой запас: приложение ищет слово списка так же, как слово из книги, поэтому формы (said, found, left) сходятся с
# основными словами (say, find) и выпадают, а часть слов отсеивается без перевода. На настоящем словаре выпадает около 13% списка.
DEFAULT_SIZE = 6500
OPEN_POS = {"noun", "verb", "adjective", "adverb", "n", "v", "adj", "adv"}
WORD_RE = re.compile(r"^[a-z][a-z'-]+$")
# слово для списка: одни буквы (ту же проверку делает isPlainWord в js/freqdeck.js)
PLAIN_RE = re.compile(r"^[a-z]{2,}$")


def function_words(path: Path = JS) -> set[str]:
    """Служебные слова из js/freqdeck.js (между маркерами FUNCTION-WORDS-BEGIN и FUNCTION-WORDS-END): один перечень на приложение и сборщик."""
    text = path.read_text(encoding="utf-8")
    m = re.search(r"FUNCTION-WORDS-BEGIN\s*\n(.*?)// FUNCTION-WORDS-END", text, re.S)
    if not m:
        raise SystemExit(f"В {path} не найден перечень служебных слов (маркеры FUNCTION-WORDS-BEGIN/END)")
    src = re.search(r"`(.*?)`", m.group(1), re.S)
    if not src:
        raise SystemExit(f"В {path} перечень служебных слов не найден между обратными кавычками")
    return {w for w in src.group(1).split() if w}


def is_content_pos(pos: str) -> bool:
    """Содержательная ли часть речи записи (то же правило, что isContentPos в js/freqdeck.js)."""
    parts = [p for p in re.split(r"[\s,;/]+", (pos or "").lower()) if p]
    return not parts or any(p in OPEN_POS for p in parts)


def has_translation(e: dict) -> bool:
    return bool(e.get("ru") or e.get("rm"))


def lemma_forms(e: dict, heads: set[str]) -> set[str]:
    """Формы слова, частоты которых складываются: само слово, правильные формы по правилам и неправильные формы записи."""
    w = e["w"]
    forms = {w}
    forms |= {f for f in build_dict.regular_forms(w) if f not in heads and WORD_RE.match(f)}
    forms |= {f for f in e.get("f", []) if WORD_RE.match(f)}
    return forms


def rank_lemmas(entries: list[dict], freq, stop: set[str], size: int = DEFAULT_SIZE, min_freq: float = 0.0) -> list[tuple[str, float]]:
    """Содержательные слова словаря по убыванию суммарной частоты форм: [(слово, частота)]. freq(форма) — доля слова в текстах."""
    heads = {e["w"] for e in entries if e.get("t") == "w"}
    scored = []
    for e in entries:
        if e.get("t") != "w" or e["w"] in stop or not PLAIN_RE.match(e["w"]):
            continue
        if not has_translation(e) or not is_content_pos(e.get("pos", "")):
            continue
        total = sum(freq(f) for f in lemma_forms(e, heads))
        if total > min_freq:
            scored.append((e["w"], total))
    scored.sort(key=lambda p: (-p[1], p[0]))
    return scored[:size]


def make_freq():
    try:
        from wordfreq import word_frequency
    except ImportError:
        raise SystemExit("Нужна библиотека wordfreq: pip install wordfreq")
    return lambda text: word_frequency(text, "en")


def write(out: Path, words: list[str], src: str = "wordfreq") -> None:
    data = {"v": 1, "src": src, "built": date.today().isoformat(), "size": len(words), "words": words}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Сборка data/freq.json", epilog=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dict", type=Path, default=DICT, help="словарь, из которого берутся слова и формы (по умолчанию data/dict.json)")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--size", type=int, default=DEFAULT_SIZE, help=f"сколько слов записать (по умолчанию {DEFAULT_SIZE}: пять тысяч и запас)")
    args = ap.parse_args(argv)

    if not args.dict.exists():
        raise SystemExit(f"Нет файла {args.dict}. Сначала соберите словарь: python3 tools/build_dict.py --wiktionary")
    entries = json.loads(args.dict.read_text(encoding="utf-8"))
    words_total = sum(1 for e in entries if e.get("t") == "w")
    if words_total < 2000:
        raise SystemExit(f"В словаре всего {words_total} слов: это пробный образец. Соберите полный словарь (python3 tools/build_dict.py --wiktionary), потом список.")
    ranked = rank_lemmas(entries, make_freq(), function_words(), args.size)
    if len(ranked) < 5000:
        print(f"ВНИМАНИЕ: нашлось только {len(ranked)} подходящих слов (нужно 5000). Возможно, словарь собран с высоким --min-zipf.", file=sys.stderr)
    write(args.out, [w for w, _ in ranked])
    print(f"Готово: {len(ranked)} слов → {args.out}")
    print("Первые:", ", ".join(w for w, _ in ranked[:15]))
    print("Около 1000-го:", ", ".join(w for w, _ in ranked[990:1000]))
    print("Около 5000-го:", ", ".join(w for w, _ in ranked[4990:5000]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
