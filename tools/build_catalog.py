#!/usr/bin/env python3
"""Собирает каталог встроенных книг: books/catalog.json и обложки books/covers/.

Зачем. Книги, которые лежат в папке books/ репозитория, приложение предлагает на телефоне готовыми:
нажали на книгу — она один раз скачалась на устройство и дальше читается без интернета. Этот скрипт
читает названия, авторов и обложки из самих EPUB и записывает список, который приложение показывает.

Как пользоваться:
    положите EPUB в books/ (в подпапку, если хотите отдельную папку), затем
    python tools/build_catalog.py
Каталог собирается и при публикации на GitHub Pages (.github/workflows/pages.yml), так что вручную
запускать его нужно только для просмотра на компьютере. Сами файлы catalog.json и covers/ в репозиторий
не кладутся (.gitignore): они всегда получаются из книг заново.

Правила:
  • книги прямо в books/ попадают в папку «default» с названием «Встроенные»;
  • подпапка в books/ — вложенная папка внутри «Встроенных» (в приложении это тоже встроенная папка);
  • вложенность одна: books/Детям/alice.epub есть, а books/Детям/Сказки/… приложение не покажет как отдельную папку.
    Такие книги попадут в «Детям», а сборка напомнит, что подпапку глубже можно убрать;
  • books/groups.json (необязательный) задаёт названия и порядок вложенных папок:
        {"default": "Для Сони", "kids": "Детям"}
    ключ — имя подпапки (или default), значение — название в приложении;
  • папки — это просто метки: свои папки, в том числе внутри «Встроенных», приложение хранит на телефоне.

Важно. Репозиторий открытый: книги из books/ может скачать любой. Кладите только то, что можно свободно
распространять (например, книги из Project Gutenberg, Standard Ebooks, Wikisource).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = ROOT / "books"
DEFAULT_GROUP = "default"
DEFAULT_GROUP_NAME = "Встроенные"
MAX_BOOK_BYTES = 90 * 1024 * 1024  # GitHub не принимает файлы больше 100 МБ
COVER_HEIGHT = 276  # обложка в списке 92 px; 276 = три физических пикселя на один
RAW_COVER_LIMIT = 150 * 1024  # без Pillow копируем обложку как есть, только если она небольшая

NS = {
    "c": "urn:oasis:names:tc:opendocument:xmlns:container",
    "o": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}


class BookError(Exception):
    pass


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_epub(data: bytes) -> dict:
    """Название, автор и обложка (байты и тип) из EPUB. Что не нашлось, остаётся пустым."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as err:
        raise BookError("это не EPUB (не открывается как архив)") from err
    try:
        container = ET.fromstring(z.read("META-INF/container.xml"))
        rootfile = container.find(".//c:rootfile", NS)
        opf_path = rootfile.attrib["full-path"]
        opf = ET.fromstring(z.read(opf_path))
    except (KeyError, AttributeError, ET.ParseError) as err:
        raise BookError("в EPUB нет описания книги (content.opf)") from err

    def first_text(name: str) -> str:
        for el in opf.iter(f"{{{NS['dc']}}}{name}"):
            text = " ".join("".join(el.itertext()).split())
            if text:
                return text
        return ""

    manifest = {}
    for item in opf.iter(f"{{{NS['o']}}}item"):
        manifest[item.attrib.get("id", "")] = item.attrib

    cover_item = None
    for attrs in manifest.values():  # EPUB 3: properties="cover-image"
        if "cover-image" in (attrs.get("properties") or "").split():
            cover_item = attrs
            break
    if cover_item is None:  # EPUB 2: <meta name="cover" content="id-обложки"/>
        for meta in opf.iter(f"{{{NS['o']}}}meta"):
            if meta.attrib.get("name") == "cover" and meta.attrib.get("content") in manifest:
                cover_item = manifest[meta.attrib["content"]]
                break

    cover = None
    if cover_item and (cover_item.get("media-type") or "").startswith("image/"):
        href = cover_item.get("href", "")
        path = posixpath.normpath(posixpath.join(posixpath.dirname(opf_path), re.sub(r"%([0-9A-Fa-f]{2})", lambda m: chr(int(m.group(1), 16)), href)))
        try:
            cover = (z.read(path), cover_item["media-type"])
        except KeyError:
            cover = None
    return {"title": first_text("title"), "author": first_text("creator"), "cover": cover}


def make_cover(raw: bytes, media: str) -> tuple[bytes, str] | None:
    """Обложка для списка: небольшой JPEG. Без Pillow подходит только уже небольшой файл."""
    try:
        from PIL import Image  # type: ignore
    except ImportError:
        if len(raw) <= RAW_COVER_LIMIT and media in ("image/jpeg", "image/png"):
            return raw, "png" if media == "image/png" else "jpg"
        return None
    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        if img.height > COVER_HEIGHT:
            img = img.resize((max(1, round(img.width * COVER_HEIGHT / img.height)), COVER_HEIGHT), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, "JPEG", quality=80, optimize=True)
        return out.getvalue(), "jpg"
    except Exception:  # битая или необычная картинка: пусть будет буква вместо обложки
        return None


def slug(name: str) -> str:
    s = re.sub(r"[\W_]+", "-", name.casefold(), flags=re.UNICODE).strip("-")
    return s or hashlib.sha1(name.encode("utf-8")).hexdigest()[:6]


def pretty_stem(stem: str) -> str:
    return " ".join(re.sub(r"[_]+", " ", stem).split())


def load_group_names(books_dir: Path) -> dict[str, str]:
    path = books_dir / "groups.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))  # «Блокнот» Windows добавляет BOM
    except (OSError, json.JSONDecodeError) as err:
        print(f"  ! groups.json не прочитан ({err}); названия папок будут по именам подпапок")
        return {}
    return {str(k): " ".join(str(v).split()) for k, v in data.items() if isinstance(data, dict) and str(v).strip()}


def build(books_dir: Path, out_path: Path | None = None) -> dict:
    """Читает books_dir, пишет каталог и обложки. Возвращает {'catalog': ..., 'warnings': [...]}."""
    out_path = out_path or books_dir / "catalog.json"
    covers_dir = out_path.parent / "covers"
    warnings: list[str] = []
    notices: list[str] = []
    found: dict[str, list[tuple[Path, str]]] = {}  # имя папки → [(файл, путь от books/)]
    for f in sorted(books_dir.rglob("*"), key=lambda p: p.as_posix().casefold()):
        if not f.is_file() or f.suffix.lower() != ".epub" or covers_dir in f.parents:
            continue
        rel = f.relative_to(books_dir)
        folder = rel.parts[0] if len(rel.parts) > 1 else DEFAULT_GROUP
        if len(rel.parts) > 2:
            notices.append(f"{rel.as_posix()}: подпапка глубже одной не поддерживается; книга лежит в папке «{rel.parts[0]}»")
        found.setdefault(folder, []).append((f, rel.as_posix()))

    names = load_group_names(books_dir)
    # «Встроенные» всегда первая, за ней вложенные: сначала названные в groups.json, потом по алфавиту
    children = [k for k in names if k in found and k != DEFAULT_GROUP] + sorted((k for k in found if k not in names and k != DEFAULT_GROUP), key=str.casefold)
    order = ([DEFAULT_GROUP] if found or children else []) + children
    group_ids: dict[str, str] = {}
    used: set[str] = set()
    for folder in order:
        gid = f"s-{slug(folder)}"
        n = 2
        while gid in used:
            gid = f"s-{slug(folder)}-{n}"
            n += 1
        used.add(gid)
        group_ids[folder] = gid
    root_id = group_ids.get(DEFAULT_GROUP, "")
    groups = [
        {"id": group_ids[f], "name": names.get(f) or (DEFAULT_GROUP_NAME if f == DEFAULT_GROUP else f), "parent": "" if f == DEFAULT_GROUP else root_id}
        for f in order
    ]

    if covers_dir.exists():
        for old in covers_dir.iterdir():
            if old.is_file():
                old.unlink()
    books: dict[str, dict] = {}
    for folder in order:
        entries = []
        for f, rel in found.get(folder, []):
            data = f.read_bytes()
            if len(data) > MAX_BOOK_BYTES:
                warnings.append(f"{rel}: файл больше 90 МБ, GitHub не примет его; книга пропущена")
                continue
            try:
                info = read_epub(data)
            except BookError as err:
                warnings.append(f"{rel}: {err}; книга пропущена")
                continue
            bid = "c-" + hashlib.sha1(data).hexdigest()[:12]  # по содержимому: переименование файла ничего не ломает
            entries.append((bid, rel, data, info))
        for bid, rel, data, info in sorted(entries, key=lambda e: ((e[3]["title"] or pretty_stem(Path(e[1]).stem)).casefold(), e[1])):
            if bid in books:  # тот же файл лежит в двух папках: одна книга, две папки
                if group_ids[folder] not in books[bid]["groups"]:
                    books[bid]["groups"].append(group_ids[folder])
                continue
            cover_rel = ""
            if info["cover"]:
                made = make_cover(*info["cover"])
                if made:
                    covers_dir.mkdir(parents=True, exist_ok=True)
                    (covers_dir / f"{bid}.{made[1]}").write_bytes(made[0])
                    cover_rel = f"covers/{bid}.{made[1]}"
            books[bid] = {
                "id": bid,
                "file": rel,
                "title": info["title"] or pretty_stem(Path(rel).stem),
                "author": info["author"],
                "size": len(data),
                "cover": cover_rel,
                "groups": [group_ids[folder]],
            }
    filled = {g["id"] for g in groups if any(g["id"] in b["groups"] for b in books.values())}
    keep = [g for g in groups if g["id"] in filled or (g["id"] == root_id and filled)]  # «Встроенные» нужны, пока в них есть вложенные
    catalog = {"groups": keep, "books": list(books.values())}
    out_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return {"catalog": catalog, "warnings": warnings, "notices": notices}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("dir", nargs="?", default=str(DEFAULT_DIR), help="папка с книгами (по умолчанию books/)")
    ap.add_argument("--strict", action="store_true", help="завершиться с ошибкой, если какую-то книгу пришлось пропустить")
    args = ap.parse_args(argv)
    books_dir = Path(args.dir)
    if not books_dir.is_dir():
        print(f"Папки {books_dir} нет: встроенных книг не будет. Создайте её и положите туда EPUB.")
        return 0
    result = build(books_dir)
    catalog = result["catalog"]
    total = sum(b["size"] for b in catalog["books"])
    for w in result["warnings"]:
        print(f"  ! {w}")
    for n in result["notices"]:
        print(f"  · {n}")
    by_group = {g["id"]: sum(1 for b in catalog["books"] if g["id"] in b["groups"]) for g in catalog["groups"]}
    print(f"Каталог готов: {len(catalog['books'])} книг, {total / 1024 / 1024:.1f} МБ → {books_dir / 'catalog.json'}")
    for g in catalog["groups"]:
        print(f"  {'  – ' if g['parent'] else '• '}{g['name']}: {by_group[g['id']]}")
    if total > 400 * 1024 * 1024:
        print("  ! Больше 400 МБ: сайт на GitHub Pages ограничен 1 ГБ, а репозиторию лучше оставаться заметно меньше.")
    print("Напоминание: репозиторий открытый, в books/ нужны только книги, которые можно свободно распространять.")
    return 1 if (args.strict and result["warnings"]) else 0


if __name__ == "__main__":
    sys.exit(main())
