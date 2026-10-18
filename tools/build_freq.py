#!/usr/bin/env python3
"""Собирает частотный список для «Топ слов по частотности»: data/freq.json.

Источник. Списки семей слов Пола Нейшна по корпусам BNC и COCA (файл BNC_COCA_lists.xlsx: 25 списков по 1000 семей,
от самых частых к редким; в таблице колонки List, Headword, Related forms, Total frequency). Семья слов это основное слово
со всеми формами и производными (accept, accepts, accepted, acceptable, acceptance…). Первые десять списков это десять тысяч самых
нужных семей. Внутри списка семьи упорядочены по суммарной частоте.

Как строится список. От каждой семьи берётся её основное слово (headword): say, go, make, accept… Служебные слова (предлоги, артикли,
местоимения, вспомогательные глаголы; их перечень лежит в js/freqdeck.js между маркерами FUNCTION-WORDS) и записи не из букв
пропускаются. Файл содержит тринадцать списков: десять нужных и три запасных (служебные слова и слова без перевода выпадают, это около 15%). Подходит ли слово для
проверки, решает приложение, когда ищет его в словаре так же, как слово из книги: missed найдётся как miss, слово без перевода в
проверку не попадёт, а за ним идёт слово из запаса, чтобы набралось десять тысяч. Словарь для сборки не нужен.

Запуск (нужен только Python, лишних библиотек нет):
    python3 tools/build_freq.py путь/к/BNC_COCA_lists.xlsx
Готовый data/freq.json нужно закоммитить. Сам файл xlsx в репозиторий не кладётся: в data/freq.json попадают только слова.
После сборки запустите node tools/audit_dict.mjs: он покажет, сколько слов войдёт в «Топ слов по частотности» и какие не нашлись в словаре.
Списки: Paul Nation, «BNC/COCA word family lists» (Victoria University of Wellington); автор публикует их на своей странице для скачивания.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "freq.json"
JS = ROOT / "js" / "freqdeck.js"
SRC_NAME = "nation-bnc-coca"
# Сколько списков по 1000 семей брать: десять нужных и три запасных (служебные слова и слова без перевода в словаре выпадают: около 15%).
LISTS = 13
# слово для списка: одни буквы (ту же проверку делает isPlainWord в js/freqdeck.js)
PLAIN_RE = re.compile(r"^[a-z]{2,}$")
FORM_RE = re.compile(r"([^,()]+?)\s*\((\d+)\)")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


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


def read_xlsx(path: Path) -> list[list[str]]:
    """Строки первого листа xlsx как списки текста (без сторонних библиотек: xlsx это zip с xml)."""
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")) for si in root.findall("m:si", NS)]
        book = ET.fromstring(z.read("xl/workbook.xml"))
        first = book.find("m:sheets/m:sheet", NS)
        target = "xl/worksheets/sheet1.xml"
        if first is not None and "xl/_rels/workbook.xml.rels" in names:
            rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
            for r in rels:
                if r.get("Id") == first.get(REL):
                    t = r.get("Target", "")
                    target = t.lstrip("/") if t.startswith("/") else "xl/" + t
        sheet = ET.fromstring(z.read(target))
    rows = []
    for row in sheet.iter(f"{{{NS['m']}}}row"):
        cells: dict[int, str] = {}
        for c in row.findall("m:c", NS):
            col = 0
            for ch in re.match(r"[A-Z]+", c.get("r", "A"))[0]:
                col = col * 26 + ord(ch) - 64
            kind = c.get("t")
            v = c.find("m:v", NS)
            if kind == "inlineStr":
                text = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
            elif v is None or v.text is None:
                text = ""
            elif kind == "s":
                text = shared[int(v.text)]
            else:
                text = v.text
            cells[col - 1] = text
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows


def read_families(rows: list[list[str]]) -> list[dict]:
    """Семьи слов из строк таблицы: [{list, head, total, members: [(форма, частота)]}] в порядке таблицы."""
    out = []
    for r in rows:
        if len(r) < 4:
            continue
        m = re.fullmatch(r"\s*(\d+)k\s*", r[0] or "", re.I)
        if not m:
            continue  # заголовок и пустые строки
        members = [(f.strip().lower(), int(n)) for f, n in FORM_RE.findall(r[2] or "")]
        try:
            total = int(float(r[3]))
        except ValueError:
            total = sum(n for _, n in members)
        out.append({"list": int(m[1]), "head": (r[1] or "").strip().lower(), "total": total, "members": members})
    return out


def pick_words(families: list[dict], stop: set[str], lists: int = LISTS) -> list[tuple[str, int]]:
    """[(слово, номер списка)] в порядке для приложения: списки по возрастанию, внутри списка по убыванию частоты семьи.
    От семьи берётся основное слово. Служебные слова и записи не из букв (1, 0) пропускаются. Подходит ли слово для проверки
    (есть ли перевод, содержательная ли часть речи), решает приложение, когда ищет его в словаре так же, как слово из книги:
    missed найдётся как miss, а слово без перевода в проверку не попадёт."""
    chosen, seen = [], set()
    for fam in sorted((f for f in families if f["list"] <= lists), key=lambda f: (f["list"], -f["total"], f["head"])):
        head = fam["head"]
        if head in stop or not PLAIN_RE.match(head) or head in seen:
            continue
        seen.add(head)
        chosen.append((head, fam["list"]))
    return chosen


def write(out: Path, words: list[str], src: str = SRC_NAME) -> None:
    data = {"v": 1, "src": src, "built": date.today().isoformat(), "size": len(words), "words": words}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Сборка data/freq.json из списков Нейшна", epilog=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx", type=Path, help="файл BNC_COCA_lists.xlsx")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--lists", type=int, default=LISTS, help=f"сколько списков по 1000 семей брать (по умолчанию {LISTS}: десять и запас)")
    args = ap.parse_args(argv)

    if not args.xlsx.exists():
        raise SystemExit(f"Нет файла {args.xlsx}. Укажите путь к BNC_COCA_lists.xlsx: python3 tools/build_freq.py путь/к/файлу.xlsx")
    families = read_families(read_xlsx(args.xlsx))
    per_list = {k: sum(1 for f in families if f["list"] == k) for k in range(1, args.lists + 1)}
    if any(n < 900 for n in per_list.values()):
        raise SystemExit(f"В файле {args.xlsx} не те данные: ждали по ~1000 семей в каждом из списков 1k–{args.lists}k, а нашлось {per_list}")
    picked = pick_words(families, function_words(), args.lists)
    write(args.out, [w for w, _ in picked])
    by_list = {k: sum(1 for _, n in picked if n == k) for k in range(1, args.lists + 1)}
    print(f"Готово: {len(picked)} слов → {args.out}")
    print("Из списков Нейшна:", ", ".join(f"{k}k: {n}" for k, n in by_list.items()))
    print("Первые:", ", ".join(w for w, _ in picked[:15]))
    print("Около 1000-го:", ", ".join(w for w, _ in picked[950:960]))
    print("Около 5000-го:", ", ".join(w for w, _ in picked[4990:5000]))
    print("Около 10000-го:", ", ".join(w for w, _ in picked[9990:10000]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
