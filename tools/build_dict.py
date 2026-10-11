#!/usr/bin/env python3
"""Собирает data/dict.json из data-src/glossary.psv.

Колонки: type | headword | pos | ru | en | example | patterns (;) | extra forms (;) | flags
Запуск:  python3 tools/build_dict.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "glossary.psv"
OUT = ROOT / "data" / "dict.json"
TYPES = {"w", "pv", "id"}


def main() -> int:
    entries, seen, errors = [], set(), []
    for n, raw in enumerate(SRC.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        cols = [c.strip() for c in line.split("|")]
        cols += [""] * (9 - len(cols))
        t, w, pos, ru, en, ex, pats, forms, flags = cols[:9]
        if t not in TYPES:
            errors.append(f"строка {n}: неизвестный тип {t!r}")
            continue
        if not (w and pos and ru and en and ex):
            errors.append(f"строка {n}: пустое поле у {w!r}")
            continue
        key = (t, w.lower())
        if key in seen:
            errors.append(f"строка {n}: дубликат {t}:{w}")
            continue
        seen.add(key)
        item = {"w": w.lower(), "t": t, "pos": pos, "ru": ru, "en": en, "ex": ex}
        if pats:
            item["m"] = [p.strip().lower() for p in pats.split(";") if p.strip()]
        if forms:
            item["f"] = [f.strip().lower() for f in forms.split(";") if f.strip()]
        if "sep" in flags.split(","):
            item["sep"] = True
        entries.append(item)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    entries.sort(key=lambda e: (e["t"], e["w"]))
    OUT.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    counts = {t: sum(1 for e in entries if e["t"] == t) for t in TYPES}
    print(f"записей: {len(entries)}  {counts}  ->  {OUT.relative_to(ROOT)}  ({OUT.stat().st_size // 1024} КБ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
