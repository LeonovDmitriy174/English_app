#!/usr/bin/env python3
"""Собирает словарь приложения: data/dict.json.

Откуда берутся записи:
  1. data-src/glossary.psv — записи, написанные вручную. Они главнее всего остального.
  2. Wiktionary (флаг --wiktionary) — слова, фразовые глаголы и идиомы с русскими переводами,
     определениями и примерами. Берётся готовый разбор английского Викисловаря от проекта
     wiktextract (kaikki.org), поэтому ничего парсить самим не нужно.

Зачем это нужно. Приложение разбирает любую добавленную книгу само, но разбирать ему нужно
по какому-то словарю. Этот словарь собирается ОДИН раз на вашем компьютере, дальше книги
добавляются без участия разработчика.

Быстрый старт:
    pip install wordfreq                       # частоты слов; без него смотрите --no-freq
    python3 tools/build_dict.py --wiktionary   # скачает дамп (около 2,8 ГБ) и соберёт словарь

Первый запуск долгий (скачивание и один проход по дампу, 15–30 минут), он делает небольшой
кэш только с английскими статьями. Повторные запуски (например, с другим --min-zipf) идут
за несколько минут. Кэш лежит ВНЕ репозитория: ~/.ember-cache.

Данные Викисловаря распространяются на условиях CC BY-SA. Ссылка на источник есть в README
и на экране «Настройки → О приложении».
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PSV = ROOT / "data-src" / "glossary.psv"
OUT = ROOT / "data" / "dict.json"
DEFAULT_CACHE = Path.home() / ".ember-cache"
MT_CACHE = ROOT / "data-src" / "mt-ru.jsonl"  # переводы определений, сделанные tools/translate_glosses.py
DUMP_URL = "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz"
DUMP_NAME = "raw-wiktextract-data.jsonl.gz"
ENGLISH_NAME = "english-entries.jsonl.gz"
TYPES = ("w", "pv", "id")
MAX_ZIPF = 8.5  # выше этого частоты в природе не бывает; 9.0 у нас означает «частоты отключены»


# ── Ручной глоссарий ───────────────────────────────────────────────────────
def read_glossary(path: Path = PSV):
    """Колонки: type | headword | pos | ru | en | example | patterns (;) | extra forms (;) | flags"""
    entries, seen, errors = [], set(), []
    if not path.exists():
        return entries, errors
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
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
    return entries, errors


# ── Разбор статей Викисловаря ──────────────────────────────────────────────
SINGLE_RE = re.compile(r"^[a-z]+(?:'[a-z]+)?$")
HYPHEN_RE = re.compile(r"^[a-z]+(?:-[a-z]+)+$")
CYRILLIC = re.compile(r"[а-яёА-ЯЁ]")

POS_NAMES = {
    "noun": "noun", "verb": "verb", "adj": "adjective", "adv": "adverb", "prep": "preposition",
    "conj": "conjunction", "pron": "pronoun", "intj": "interjection", "det": "determiner",
    "num": "numeral", "article": "article", "particle": "particle", "postp": "postposition",
    "phrase": "phrase", "prep_phrase": "phrase", "proverb": "proverb",
}
# Эти части речи в словарь не берём: имена, приставки, сокращения и т. п.
SKIP_POS = {
    "name", "character", "symbol", "prefix", "suffix", "infix", "affix", "circumfix", "interfix",
    "combining_form", "punct", "abbrev", "contraction", "proverb", "num_character",
}
BAD_SENSE_TAGS = {"abbreviation", "acronym", "initialism", "misspelling", "obsolete", "alt-of", "form-of"}
WEAK_SENSE_TAGS = {"archaic", "dated", "rare", "dialectal", "nonstandard", "historical", "uncommon", "poetic"}
BAD_TRANSLATION_TAGS = {"obsolete", "archaic", "dialectal", "dated", "rare", "vulgar", "offensive"}
FIXED_POS = {"phrase", "prep_phrase", "adv", "prep", "conj", "intj", "adv_phrase"}
PARTICLES = {
    "up", "down", "out", "in", "on", "off", "over", "away", "back", "through", "along", "around",
    "about", "by", "apart", "ahead", "across", "forward", "aside", "together", "under", "behind",
    "for", "into", "with", "at", "to", "from", "after", "against", "onto", "upon",
}
# После таких частиц можно вставить слово: «pick it up», но не «look it after»
SEPARABLE = {"up", "down", "out", "in", "on", "off", "over", "away", "back", "around", "apart", "aside", "together", "through", "along"}
POSS_PLACEHOLDERS = {"one's", "someone's", "somebody's", "anyone's", "anybody's"}
WILD_PLACEHOLDERS = {"someone", "somebody", "something", "anyone", "anybody", "anything", "oneself", "sb", "sth"}
FORMISH_GLOSS = re.compile(
    r"^(?!(?:a|an|the)\b)(?:[\w-]+ ){0,3}(?:form|spelling|variant|misspelling|abbreviation|initialism|acronym|"
    r"contraction|participle|plural|singular|tense|comparative|superlative|gerund|clipping) of\b",
    re.I,
)


def clip(text: str, limit: int = 140) -> str:
    text = " ".join(text.split()).rstrip(".")
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(",;:- ") + "…"


def clean_ru(raw: str) -> str:
    """Русское слово без знаков ударения и мусора; пустая строка, если слово не подходит."""
    w = unicodedata.normalize("NFD", raw)
    w = w.replace("́", "").replace("̀", "").replace("­", "")
    w = unicodedata.normalize("NFC", w).strip()
    if not w or len(w) > 40 or not CYRILLIC.search(w):
        return ""
    if re.search(r"[\[\]{}<>|=_*#@]", w):
        return ""
    return w


def category_names(obj) -> list[str]:
    """Категории бывают строками или объектами {"name": …}; принимаем оба вида."""
    out = []
    for c in obj.get("categories") or []:
        if isinstance(c, str):
            out.append(c)
        elif isinstance(c, dict) and c.get("name"):
            out.append(str(c["name"]))
    return out


def russian_from(translations, group: str = "") -> list[tuple[str, str]]:
    """Русские переводы как пары (значение, слово). Значение нужно, чтобы не мешать разные смыслы в одну кучу."""
    out = []
    for t in translations or []:
        if not isinstance(t, dict):
            continue
        code = t.get("lang_code") or t.get("code")
        if code != "ru" and t.get("lang") != "Russian":
            continue
        if set(t.get("tags") or []) & BAD_TRANSLATION_TAGS:
            continue
        w = clean_ru(str(t.get("word") or ""))
        if w:
            out.append((group or str(t.get("sense") or ""), w))
    return out


def pick_example(sense, word: str, check_stem: bool) -> str:
    stem = word[: max(3, len(word) - 3)]
    for ex in sense.get("examples") or []:
        if not isinstance(ex, dict):
            continue
        text = ex.get("text")
        if not text or ex.get("ref") or ex.get("type") not in (None, "example"):
            continue
        text = " ".join(str(text).split())
        if not 15 <= len(text) <= 110 or re.search(r"[\[\]{}]", text):
            continue
        if check_stem and stem not in text.lower():
            continue
        return text
    return ""


def read_entry(obj):
    """Приводит строку дампа к простой записи. None — если это не английская статья."""
    if not isinstance(obj, dict) or obj.get("lang_code") != "en" or "redirect" in obj:
        return None
    word, pos = obj.get("word"), obj.get("pos")
    if not word or not pos:
        return None
    cats = set(category_names(obj))
    form_lemmas, good, ru = set(), [], russian_from(obj.get("translations"))
    transitive = False
    sense_ru = []
    for n, s in enumerate(obj.get("senses") or []):
        if not isinstance(s, dict):
            continue
        cats.update(category_names(s))
        tags = set(s.get("tags") or [])
        for fo in s.get("form_of") or []:
            lemma = fo.get("word") if isinstance(fo, dict) else None
            if lemma:
                form_lemmas.add(str(lemma))
        if s.get("form_of") or s.get("alt_of") or tags & BAD_SENSE_TAGS:
            continue
        glosses = [g for g in (s.get("glosses") or []) if isinstance(g, str)]
        if not glosses or FORMISH_GLOSS.match(glosses[-1]):
            continue
        rank = 1 if tags & WEAK_SENSE_TAGS else 0
        good.append({"rank": rank, "gloss": glosses[-1], "sense": s})
        if "transitive" in tags or "ditransitive" in tags:
            transitive = True
        sense_ru.extend(russian_from(s.get("translations"), f"#{n}"))
    forms = []
    for f in obj.get("forms") or []:
        if not isinstance(f, dict):
            continue
        form = str(f.get("form") or "")
        if set(f.get("tags") or []) & {"table-tags", "inflection-template", "class", "romanization"}:
            continue
        if SINGLE_RE.match(form) and form != word:
            forms.append(form)
    return {
        "word": word,
        "pos": pos,
        "cats": cats,
        "senses": good,
        "ru": sense_ru + ru,
        "forms": forms,
        "transitive": transitive,
        "form_lemmas": form_lemmas,
    }


def regular_forms(w: str) -> set[str]:
    """Формы, которые приложение и так получит по правилам (lex.js): их в словарь не пишем."""
    s = {w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "er", w + "est", w + "ly"}
    if w.endswith("e"):
        s |= {w[:-1] + "ing", w + "r", w + "st"}
    if w.endswith("y") and len(w) > 1:
        b = w[:-1]
        s |= {b + "ies", b + "ied", b + "ier", b + "iest", b + "ily"}
    if len(w) > 2:
        c = w[-1]
        s |= {w + c + "ed", w + c + "ing", w + c + "er", w + c + "est"}
    return s


def expand_optional(text: str, limit: int = 2) -> list[str]:
    """«a (little) bird» -> [«a little bird», «a bird»]. Больше `limit` скобок не раскрываем."""
    variants, seen = [""], 0
    for part in re.split(r"(\([^()]*\))", text):
        if len(part) > 1 and part[0] == "(" and part[-1] == ")":
            seen += 1
            inner = part[1:-1]
            variants = [v + inner for v in variants] + (variants if seen <= limit else [])
        else:
            variants = [v + part for v in variants]
    out = []
    for v in variants:
        v = " ".join(v.split())
        if v and v not in out:
            out.append(v)
    return out


def patterns(head: str, pos: str = "") -> list[str] | None:
    """Шаблоны для поиска фразы в тексте (см. lex.js: @ — my/his/…, * — любое слово)."""
    h = head.lower().replace("’", "'").strip()
    if re.search(r"[^a-z'() \-]", h):
        return None
    out = []
    for v in expand_optional(h.replace("-", " ")):
        toks = v.split()
        if pos == "verb" and len(toks) >= 3 and toks[0] == "to":
            toks = toks[1:]
        conv = []
        for t in toks:
            if t in POSS_PLACEHOLDERS:
                conv.append("@")
            elif t in WILD_PLACEHOLDERS:
                conv.append("*")
            elif SINGLE_RE.match(t):
                conv.append(t)
            else:
                return None
        literal = [t for t in conv if t not in ("@", "*")]
        if len(conv) < 2 or len(literal) < 2 or conv[0] in ("@", "*"):
            continue
        s = " ".join(conv)
        if s not in out:
            out.append(s)
    return out[:4] or None


# ── Автоперевод определений ────────────────────────────────────────────────
# У многих записей Викисловаря нет русского перевода. Для них tools/translate_glosses.py переводит
# английское определение офлайн-моделью, а результат лежит в data-src/mt-ru.jsonl (строка на определение:
# {"en": …, "ru": …}). Сборщик подставляет его в поле «rm». Приложение показывает его с пометкой «автоперевод».
def mt_source(gloss: str) -> str:
    """Что подаём модели: определение с заглавной буквы, без точки в конце."""
    g = " ".join(gloss.split()).rstrip(".")
    return g[:1].upper() + g[1:]


def mt_clean(out: str) -> str:
    """Ответ модели -> строчное определение без точки («Внезапная вспышка.» -> «внезапная вспышка»)."""
    t = " ".join(out.split()).rstrip(".")
    t = re.sub(r"^[Чч]тобы\s+", "", t)
    if len(t) > 1 and t[0].isupper() and not t[1].isupper():
        t = t[0].lower() + t[1:]
    return t


def mt_ok(src: str, out: str) -> bool:
    """Отсев явно плохих ответов модели: пустые, не по-русски, слишком длинные, зацикленные."""
    if not out or not CYRILLIC.search(out):
        return False
    if len(re.findall(r"[A-Za-z]", out)) > len(re.findall(r"[А-Яа-яЁё]", out)):
        return False
    if len(out) > 3 * len(src) + 20:
        return False
    words = out.lower().split()
    for n in (1, 2, 3):
        for i in range(len(words) - 3 * n + 1):
            if words[i : i + n] == words[i + n : i + 2 * n] == words[i + 2 * n : i + 3 * n]:
                return False
    return True


def load_mt(path: Path = MT_CACHE) -> dict[str, str]:
    """Кэш переводов: определение -> русский текст («» означает, что перевод отбракован)."""
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                o = json.loads(line)
                out[o["en"]] = o["ru"]
            except (ValueError, KeyError, TypeError):
                continue
    return out


def apply_mt(entries: list[dict], mt: dict[str, str]) -> int:
    """Записям без русского перевода добавляет поле rm. Возвращает, сколько записей получили перевод."""
    n = 0
    for e in entries:
        if not e.get("ru") and e.get("en") and mt.get(e["en"]):
            e["rm"] = mt[e["en"]]
            n += 1
    return n


# ── Сборка ─────────────────────────────────────────────────────────────────
class Builder:
    def __init__(self, zipf, min_zipf=2.4, min_zipf_noru=3.0, max_ru=4, max_ru_total=6, fixed_phrases=True):
        self._zipf = zipf
        self._zcache: dict[str, float] = {}
        self.min_zipf, self.min_zipf_noru = min_zipf, min_zipf_noru
        self.max_ru, self.max_ru_total = max_ru, max_ru_total
        self.fixed_phrases = fixed_phrases
        self.acc: dict[tuple[str, str], dict] = {}
        self.inflected: dict[str, set[str]] = defaultdict(set)
        self.stats: Counter = Counter()
        self.cat_probe: Counter = Counter()

    def zipf(self, text: str) -> float:
        z = self._zcache.get(text)
        if z is None:
            z = self._zcache[text] = self._zipf(text)
        return z

    def classify(self, rec, low: str):
        """-> (тип, шаблоны, частота, оборот_без_пометки) или None, если статью брать не нужно."""
        parts = low.split()
        pos = rec["pos"]
        cats = rec["cats"]
        if len(parts) == 1:
            if SINGLE_RE.match(low):
                z = self.zipf(low)
                return ("w", None, z, False) if z >= min(self.min_zipf, self.min_zipf_noru) else None
            if HYPHEN_RE.match(low):
                z = self.zipf(low)
                if z < min(self.min_zipf, self.min_zipf_noru):
                    return None
                return ("w", [low.replace("-", " ")], z, False)
            return None
        if len(parts) > 6:
            return None
        pats = patterns(low, pos)
        if not pats:
            return None
        if "English phrasal verbs" in cats:
            return ("pv", pats, 0.0, False)
        if "English idioms" in cats:
            return ("id", pats, 0.0, False)
        if pos == "verb" and len(parts) == 2 and parts[1] in PARTICLES and SINGLE_RE.match(parts[0]) and self.zipf(parts[0]) >= 3.0:
            return ("pv", pats, 0.0, True)
        if self.fixed_phrases and pos in FIXED_POS and len(parts) <= 4 and "*" not in " ".join(pats) and "@" not in " ".join(pats):
            if all(SINGLE_RE.match(p) and self.zipf(p) >= 3.0 for p in parts):
                return ("id", pats, 0.0, True)
        return None

    def consume(self, obj) -> None:
        rec = read_entry(obj)
        if rec is None:
            return
        self.stats["entries"] += 1
        for c in rec["cats"]:
            if "phrasal" in c.lower() or "idiom" in c.lower():
                self.cat_probe[c] += 1
        word, pos = rec["word"], rec["pos"]
        low = "i" if word == "I" else word
        if low != low.lower() or pos in SKIP_POS:
            return
        if rec["form_lemmas"] and SINGLE_RE.match(low):
            lemmas = {x.lower() for x in rec["form_lemmas"] if SINGLE_RE.match(x.lower()) and x.lower() != low}
            if lemmas and self.zipf(low) >= min(self.min_zipf, self.min_zipf_noru):
                self.inflected[low] |= lemmas
        if not rec["senses"]:
            self.stats["no_plain_sense"] += 1
            return
        cl = self.classify(rec, low)
        if cl is None:
            return
        t, pats, z, unmarked = cl
        key = (t, low)
        a = self.acc.get(key)
        if a is None:
            a = self.acc[key] = {"t": t, "w": low, "pos": [], "cand": [], "ru": [], "forms": [], "sep": False, "m": pats, "z": z, "unmarked": unmarked}
        label = POS_NAMES.get(pos, pos.replace("_", " "))
        if label not in a["pos"]:
            a["pos"].append(label)
        best = min(rec["senses"], key=lambda g: g["rank"])  # min берёт первый из равных
        check = t == "w" and " " not in low and "-" not in low
        ex = pick_example(best["sense"], low, check)
        if not ex:
            for g in rec["senses"]:
                ex = pick_example(g["sense"], low, check)
                if ex:
                    break
        a["cand"].append((best["rank"], len(a["cand"]), clip(best["gloss"]), ex))
        a["ru"].append(rec["ru"])
        a["forms"].extend(rec["forms"])
        if t == "pv" and rec["transitive"] and pats and len(pats[0].split()) == 2 and pats[0].split()[1] in SEPARABLE:
            a["sep"] = True

    def russian(self, per_pos: list[list[tuple[str, str]]]) -> str:
        """Переводы одной статьи: смыслы через «; », синонимы через «, » (не больше двух на смысл)."""
        seen, groups, total = set(), [], 0
        for pairs in per_pos:
            by_sense: dict[str, list[str]] = {}
            used = 0
            for sense, w in pairs:
                k = w.lower()
                if k in seen or used >= self.max_ru or total >= self.max_ru_total:
                    continue
                bucket = by_sense.setdefault(sense, [])
                if len(bucket) >= 2:
                    continue
                seen.add(k)
                bucket.append(w)
                used += 1
                total += 1
            groups.extend(", ".join(b) for b in by_sense.values())
        return "; ".join(groups)

    def finish(self, hand: list[dict]):
        """Склеивает найденное с ручными записями. -> список записей для dict.json."""
        items: dict[tuple[str, str], dict] = {}
        zs: dict[tuple[str, str], float] = {}
        for key, a in self.acc.items():
            ru = self.russian(a["ru"])
            if not ru and a["t"] == "w" and a["z"] < self.min_zipf_noru:
                continue
            if ru and a["t"] == "w" and a["z"] < self.min_zipf:
                continue
            if a["unmarked"] and not ru:
                continue
            cand = min(a["cand"], key=lambda c: (c[0], c[1]))
            item = {"w": a["w"], "t": a["t"], "pos": ", ".join(a["pos"])}
            if ru:
                item["ru"] = ru
            item["en"] = cand[2]
            ex = cand[3] or next((c[3] for c in sorted(a["cand"]) if c[3]), "")
            if ex:
                item["ex"] = ex
            if a["m"] and a["m"] != [a["w"]]:
                item["m"] = a["m"]
            if a["sep"]:
                item["sep"] = True
            items[key] = item
            zs[key] = a["z"]
        # Фразы, у которых нет ни перевода, ни определения, не нужны
        for key in [k for k, v in items.items() if k[0] != "w" and not v.get("ru") and not v.get("en")]:
            del items[key]

        # ручные записи главнее: заменяют автоматические с тем же ключом целиком
        fixed_forms: dict[str, str] = {}
        for h in hand:
            key = (h["t"], h["w"])
            items[key] = dict(h)
            zs[key] = 99.0
            for f in h.get("f", []):
                fixed_forms[f] = h["w"]

        headwords = {w for (t, w), v in items.items() if t == "w" and "m" not in v}
        assigned = dict(fixed_forms)
        hand_keys = {(h["t"], h["w"]) for h in hand}
        order = sorted((k for k in items if k[0] == "w" and k in self.acc and k not in hand_keys and "m" not in items[k]), key=lambda k: -zs[k])
        for key in order:
            keep = []
            base = key[1]
            reg = regular_forms(base)
            seen = set()
            for f in self.acc[key]["forms"]:
                if f in seen or f in reg or f in headwords or f in assigned:
                    continue
                seen.add(f)
                keep.append(f)
                assigned[f] = base
                if len(keep) >= 8:
                    break
            if keep:
                items[key]["f"] = keep

        # Слово может быть и формой другого слова: «left» (левый) и «left» от leave
        for key, v in items.items():
            if key[0] != "w" or "m" in v:
                continue
            lemmas = [x for x in self.inflected.get(key[1], ()) if ("w", x) in items and x != key[1]]
            if lemmas:
                lemmas.sort(key=lambda x: -zs.get(("w", x), 0))
                v["of"] = lemmas[:3]

        # Частота слова (шкала Zipf, 0–8) нужна приложению, чтобы в результатах поиска частые слова шли выше редких.
        # Для фраз частоты нет. Если частоты отключены (--no-freq), поле не пишется.
        for key, v in items.items():
            if key[0] != "w":
                continue
            z = zs.get(key)
            if z is None or z >= 90:  # слова из ручного глоссария: считаем частоту отдельно
                z = self.zipf(key[1])
            if 0 < z <= MAX_ZIPF:
                v["z"] = round(z, 1)

        out = []
        for key in sorted(items):
            v = items[key]
            out.append({k: v[k] for k in ("w", "t", "pos", "ru", "en", "ex", "m", "f", "sep", "of", "z") if k in v})
        return out


# ── Чтение дампа ───────────────────────────────────────────────────────────
MARKERS = (b'"lang_code": "en"', b'"lang_code":"en"')


def open_dump(path: Path):
    raw = open(path, "rb")
    if path.suffix == ".gz":
        return raw, gzip.GzipFile(fileobj=raw)
    return raw, raw


def stream_lines(path: Path, label: str = ""):
    """Строки (bytes) файла .jsonl / .jsonl.gz с индикатором прогресса."""
    size = path.stat().st_size
    raw, f = open_dump(path)
    started, last = time.time(), 0.0
    try:
        for n, line in enumerate(f, 1):
            if n % 100_000 == 0 and time.time() - last > 5:
                last = time.time()
                pct = 100 * raw.tell() / size if size else 0
                print(f"\r  {label} {n:>9,} строк, {pct:4.0f}%, {int(last - started)} с", end="", file=sys.stderr, flush=True)
            yield line
    finally:
        f.close()
        raw.close()
        if label:
            print(file=sys.stderr)


def english_objects(path: Path, label: str = ""):
    for line in stream_lines(path, label):
        if not any(m in line for m in MARKERS):
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if obj.get("lang_code") == "en":
            yield obj


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    have = part.stat().st_size if part.exists() else 0
    headers = {"User-Agent": "ember-chronicle-dict/1.0"}
    if have:
        headers["Range"] = f"bytes={have}-"
    print(f"Скачиваю {url}\n  в {dest}" + (f" (продолжаю с {have // 2**20} МБ)" if have else ""), file=sys.stderr)
    try:
        resp = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)
    except urllib.error.HTTPError as e:
        if e.code == 416 and have:  # файл уже докачан
            part.replace(dest)
            return
        raise SystemExit(f"Не удалось скачать ({e.code}). Скачайте файл вручную со страницы https://kaikki.org/dictionary/rawdata.html и укажите --source ПУТЬ.")
    except OSError as e:
        raise SystemExit(f"Нет связи с kaikki.org: {e}. Попробуйте позже или скачайте файл вручную и укажите --source ПУТЬ.")
    resumed = resp.status == 206
    total = int(resp.headers.get("Content-Length") or 0) + (have if resumed else 0)
    done = have if resumed else 0
    last = time.time()
    try:
        with open(part, "ab" if resumed else "wb") as out:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if time.time() - last > 5:
                    last = time.time()
                    print(f"\r  {done // 2**20} из {total // 2**20} МБ", end="", file=sys.stderr, flush=True)
    except OSError as e:
        raise SystemExit(f"\nСвязь оборвалась: {e}. Запустите ту же команду ещё раз: докачка продолжится с того же места.")
    print(file=sys.stderr)
    if total and done < total:
        raise SystemExit("Файл скачан не полностью. Запустите ту же команду ещё раз: докачка продолжится.")
    part.replace(dest)


def make_english_cache(raw_path: Path, dest: Path) -> None:
    """Один проход по полному дампу: оставляем только английские статьи."""
    tmp = dest.with_name(dest.name + ".part")
    kept = 0
    with gzip.open(tmp, "wb", compresslevel=3) as out:
        for line in stream_lines(raw_path, "выбираю английские статьи"):
            if not any(m in line for m in MARKERS):
                continue
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if obj.get("lang_code") == "en":
                out.write(line if line.endswith(b"\n") else line + b"\n")
                kept += 1
    tmp.replace(dest)
    print(f"  английских статей: {kept:,}", file=sys.stderr)


# ── Проверка данных (--probe) ──────────────────────────────────────────────
def summarize(obj) -> dict:
    """Короткая выжимка статьи: по ней видно, как устроены данные."""
    senses = []
    for s in (obj.get("senses") or [])[:3]:
        senses.append({
            "keys": sorted(s.keys()),
            "glosses": s.get("glosses"),
            "tags": s.get("tags"),
            "categories": (s.get("categories") or [])[:3],
            "translations_ru": [w for _, w in russian_from(s.get("translations"))[:4]],
            "examples": [(e.get("type"), (e.get("text") or "")[:60]) for e in (s.get("examples") or [])[:2] if isinstance(e, dict)],
        })
    return {
        "word": obj.get("word"),
        "pos": obj.get("pos"),
        "keys": sorted(obj.keys()),
        "categories": category_names(obj)[:8],
        "forms": [(f.get("form"), f.get("tags")) for f in (obj.get("forms") or [])[:6] if isinstance(f, dict)],
        "translations_ru": [w for _, w in russian_from(obj.get("translations"))[:6]],
        "translation_keys": sorted((obj.get("translations") or [{}])[0].keys()),
        "senses": senses,
    }


# ── Командная строка ───────────────────────────────────────────────────────
def make_zipf(disabled: bool):
    if disabled:
        return lambda text: 9.0
    try:
        from wordfreq import zipf_frequency
    except ImportError:
        raise SystemExit("Нужна библиотека wordfreq: pip install wordfreq\n(для пробного запуска без неё есть флаг --no-freq, но тогда в словарь попадёт много редких слов)")
    return lambda text: zipf_frequency(text, "en")


def locate_source(args) -> Path:
    cache = args.cache
    english = cache / ENGLISH_NAME
    raw = cache / DUMP_NAME
    if args.source:
        if not args.source.exists():
            raise SystemExit(f"Файл не найден: {args.source}")
        # Полный дамп (десятки ГБ) разбираем один раз и запоминаем английские статьи; маленький файл читаем напрямую
        if args.source.name.startswith("raw-wiktextract") or args.source.stat().st_size > 2**30:
            raw = args.source
        else:
            return args.source
    if args.refresh and english.exists():
        english.unlink()
    if english.exists():
        return english
    if not raw.exists():
        download(DUMP_URL, raw)
    print("Один проход по дампу, нужно подождать…", file=sys.stderr)
    make_english_cache(raw, english)
    return english


def report(b: Builder, entries: list[dict], out: Path) -> None:
    by = Counter(e["t"] for e in entries)
    no_ru = Counter(e["t"] for e in entries if not e.get("ru") and not e.get("rm"))
    auto = Counter(e["t"] for e in entries if not e.get("ru") and e.get("rm"))
    size = out.stat().st_size
    print(f"\nГотово: {len(entries):,} записей → {out}  ({size / 2**20:.1f} МБ)")
    names = {"w": "слов", "pv": "фразовых глаголов", "id": "идиом и выражений"}
    for t in TYPES:
        print(f"  {names[t]:<20} {by[t]:>7,}   автоперевод определения: {auto[t]:,}   совсем без перевода: {no_ru[t]:,}")
    if b.stats["entries"]:
        print(f"Просмотрено английских статей: {b.stats['entries']:,}")
        if not by["pv"] or not by["id"]:
            print("\nВНИМАНИЕ: фразовых глаголов или идиом не нашлось. Скорее всего, в этой версии дампа категории называются иначе.")
            print("Похожие категории в данных:", dict(b.cat_probe.most_common(10)) or "нет совсем")
            print("Запустите:  python3 tools/build_dict.py --probe \"give up\" \"kick the bucket\"  и пришлите вывод.")
    if size > 20 * 2**20:
        print("\nФайл получился больше 20 МБ. Для телефона лучше поднять --min-zipf (например, до 2.8).")


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Сборка data/dict.json", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("--wiktionary", action="store_true", help="добавить слова, фразовые глаголы и идиомы из Викисловаря")
    ap.add_argument("--source", type=Path, help="готовый файл .jsonl или .jsonl.gz вместо скачивания")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help=f"где хранить скачанное (по умолчанию {DEFAULT_CACHE})")
    ap.add_argument("--refresh", action="store_true", help="заново выбрать английские статьи из дампа")
    ap.add_argument("--min-zipf", type=float, default=2.4, help="порог частоты слова с переводом (по умолчанию 2.4; больше — меньше слов)")
    ap.add_argument("--min-zipf-noru", type=float, default=3.0, help="порог для слов без русского перевода (по умолчанию 3.0)")
    ap.add_argument("--max-ru", type=int, default=4, help="сколько русских вариантов хранить на часть речи")
    ap.add_argument("--no-freq", action="store_true", help="не использовать wordfreq (только для проверки)")
    ap.add_argument("--no-fixed-phrases", action="store_true", help="не брать устойчивые обороты вроде «at least», если они не помечены как идиомы")
    ap.add_argument("--limit", type=int, help="остановиться после N английских статей (для проверки)")
    ap.add_argument("--no-mt", action="store_true", help="не подставлять переводы определений из data-src/mt-ru.jsonl")
    ap.add_argument("--probe", nargs="+", metavar="СЛОВО", help="показать, как указанные слова выглядят в данных")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)

    hand, errors = read_glossary()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    if args.probe:
        wanted = {w.lower() for w in args.probe}
        for obj in english_objects(locate_source(args), "ищу"):
            if str(obj.get("word", "")).lower() in wanted:
                print(json.dumps(summarize(obj), ensure_ascii=False, indent=1))
        return 0

    builder = Builder(make_zipf(args.no_freq or not args.wiktionary), args.min_zipf, args.min_zipf_noru, args.max_ru, fixed_phrases=not args.no_fixed_phrases)
    if args.wiktionary:
        n = 0
        for obj in english_objects(locate_source(args), "разбираю статьи"):
            builder.consume(obj)
            n += 1
            if args.limit and n >= args.limit:
                break
        print(f"  принято к разбору: {len(builder.acc):,}", file=sys.stderr)
    entries = builder.finish(hand)
    if not args.no_mt:
        mt = load_mt(MT_CACHE)
        got = apply_mt(entries, mt)
        if mt:
            print(f"  переводов определений подставлено: {got:,} (в кэше {len(mt):,})", file=sys.stderr)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if args.wiktionary:
        report(builder, entries, args.out)
    else:
        counts = Counter(e["t"] for e in entries)
        print(f"записей: {len(entries)}  {dict(counts)}  →  {args.out}  ({args.out.stat().st_size // 1024} КБ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
