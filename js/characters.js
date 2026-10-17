// characters.js — персонажи и термины книг: заметки к именам и названиям (Jon, Winterfell, Night's Watch). Чистые функции (tests/characters.test.mjs).
//
// Заметка хранится по ключу: имя строчными буквами, без лишних знаков (normKey). Один ключ служит для всех книг: Jon из первой книги
// тот же Jon во второй. Запись: { n: как писать имя, t: описание, o?: 1 }, o ставится, когда заметку вы написали или поправили сами:
// загрузка файла такие записи не перезаписывает. Термины из файла (CSV или текст «слово;описание») попадают в тот же список.

export const MAX_CHARS = 5000; // сколько записей помнит приложение
export const MAX_NAME = 60;
export const MAX_TEXT = 400;
export const MAX_WORDS = 5; // самый длинный термин в словах: «House of the Undying» — четыре, «Lord of Light» — три

/** Ключ записи: строчные буквы, один вид апострофа, одинарные пробелы. «Night’s  Watch» → «night's watch». */
export const normKey = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** «night's watch» → «Night's Watch» (имя для показа, когда своего написания нет). */
export const titleCase = (key) => String(key || "").replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Как показывать имя: своё написание или ключ с заглавными. */
export const displayName = (key, rec) => rec?.n || titleCase(key);

const HEADERS = new Set(["term", "terms", "name", "names", "character", "characters", "key", "word", "слово", "термин", "термины", "имя", "название", "персонаж", "ключ"]);

/** Делит строку файла на название и описание. Название в кавычках может содержать разделитель. null — строка без описания. */
function splitLine(line) {
  let name;
  let rest;
  if (line[0] === '"') {
    let i = 1;
    let acc = "";
    while (i < line.length) {
      if (line[i] === '"') {
        if (line[i + 1] === '"') {
          acc += '"';
          i += 2;
          continue;
        }
        break;
      }
      acc += line[i++];
    }
    name = acc;
    rest = line.slice(i + 1).replace(/^\s*[;,\t|]\s*/, ""); // без разделителя после кавычек остаток тоже считается описанием
  } else {
    // самый ранний из разделителей «;», табуляции, «|»; если их нет, запятая, затем тире с пробелами
    const hits = [";", "\t", "|"].map((c) => line.indexOf(c)).filter((i) => i > 0);
    let at = hits.length ? Math.min(...hits) : -1;
    let len = 1;
    if (at < 0) at = line.indexOf(",");
    if (at < 0) {
      const m = / [—–-] /.exec(line);
      if (m) (at = m.index), (len = m[0].length);
    }
    if (at <= 0) return null;
    name = line.slice(0, at);
    rest = line.slice(at + len);
  }
  rest = rest.trim();
  if (rest.length > 1 && rest[0] === '"' && rest.endsWith('"')) rest = rest.slice(1, -1).replace(/""/g, '"');
  return [name, rest];
}

/**
 * Разбирает файл с терминами: по строке на термин, «название;описание» (разделитель «;», табуляция, «|», запятая или « — »).
 * Первая строка-заголовок («term;description», «имя;описание») пропускается, строки с «#» в начале тоже.
 * Возвращает { items: [{ key, name, text }], skipped }: повторы одного ключа сливаются (побеждает последний); skipped — строки,
 * из которых не вышло термина (нет описания, слишком длинное название).
 */
export function parseTerms(text) {
  const byKey = new Map();
  let skipped = 0;
  let first = true;
  for (const raw of String(text ?? "").replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    const parts = splitLine(line);
    const wasFirst = first;
    first = false;
    if (!parts) {
      skipped += 1;
      continue;
    }
    const key = normKey(parts[0]);
    if (wasFirst && HEADERS.has(key)) continue;
    const name = clean(parts[0], MAX_NAME);
    const body = clean(parts[1], MAX_TEXT);
    if (!key || !body || key.length > MAX_NAME || key.split(" ").length > MAX_WORDS) {
      skipped += 1;
      continue;
    }
    byKey.set(key, { key, name, text: body });
    if (byKey.size >= MAX_CHARS) break;
  }
  return { items: [...byKey.values()], skipped };
}

/**
 * Вливает загруженные термины в имеющиеся. Записи, написанные или правленные вами (o), не перезаписываются.
 * Возвращает { map, added, updated, kept }: новая карта, сколько добавлено, обновлено и оставлено как было.
 */
export function mergeTerms(current, items) {
  const map = new Map(current);
  let added = 0;
  let updated = 0;
  let kept = 0;
  for (const it of items) {
    const old = map.get(it.key);
    if (old?.o) {
      kept += 1;
      continue;
    }
    if (!old && map.size >= MAX_CHARS) continue;
    if (!old) added += 1;
    else if (old.t !== it.text || old.n !== it.name) updated += 1;
    else continue;
    map.set(it.key, { n: it.name, t: it.text });
  }
  return { map, added, updated, kept };
}

/** Приводит запись из хранилища или копии к виду «ключ → { n, t, o? }». Мусор отбрасывается. */
export function normalizeChars(raw) {
  const map = new Map();
  const list = Array.isArray(raw) ? raw : [];
  for (const row of list) {
    const [k, v] = Array.isArray(row) ? row : [];
    const key = normKey(k);
    const t = clean(v?.t, MAX_TEXT);
    if (!key || !t || key.split(" ").length > MAX_WORDS) continue;
    map.set(key, { n: clean(v?.n, MAX_NAME), t, ...(v?.o ? { o: 1 } : {}) });
    if (map.size >= MAX_CHARS) break;
  }
  return map;
}

/** Запись для хранилища: массив пар. */
export const charsToList = (map) => [...map].map(([k, v]) => [k, v]);

/** Копия на другое устройство или в другой файл: записи, которые есть только там, добавляются; при споре побеждает «своя» (o). */
export function mergeChars(a, b) {
  const map = new Map(a);
  let changed = 0;
  for (const [k, v] of b) {
    const mine = map.get(k);
    if (!mine || (v.o && !mine.o)) {
      map.set(k, v);
      changed += 1;
    }
  }
  return { map, changed };
}

/** Текст для копирования или сохранения: «название;описание» по строке, по алфавиту. Его же читает parseTerms. */
export function exportTerms(map) {
  const q = (s) => (/[;"\n\t|]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [...map]
    .map(([k, v]) => [displayName(k, v), v.t])
    .sort((a, b) => a[0].localeCompare(b[0], "en"))
    .map(([n, t]) => `${q(n)};${q(t)}`)
    .join("\n");
}

const bare = (surf) => surf.replace(/'s$/, ""); // «jon's» → «jon»

/**
 * Какие места абзаца заняты терминами: по токенам (js/lex.js tokenize) и карте записей. Ищется самое длинное совпадение слева направо,
 * слова должны стоять через пробел (запятая или точка между словами не годится). Последнее слово может быть притяжательным: Jon's.
 * ptext — текст абзаца (нужен, чтобы проверить, что между словами только пробел). Возвращает [{ idxs, key }].
 */
export function matchTerms(tokens, map, ptext = "") {
  const out = [];
  if (!map?.size) return out;
  const gapOk = (a, b) => !ptext || /^\s+$/.test(ptext.slice(tokens[a].end, tokens[b].start));
  let i = 0;
  while (i < tokens.length) {
    let hit = null;
    for (let len = Math.min(MAX_WORDS, tokens.length - i); len >= 1 && !hit; len--) {
      let ok = true;
      for (let k = 0; k + 1 < len; k++) if (!gapOk(i + k, i + k + 1)) ok = false;
      if (!ok) continue;
      const surfs = tokens.slice(i, i + len).map((t) => t.surf);
      for (const last of new Set([surfs[len - 1], bare(surfs[len - 1])])) {
        const key = [...surfs.slice(0, -1), last].join(" ");
        if (map.has(key)) {
          hit = { idxs: Array.from({ length: len }, (_, k) => i + k), key };
          break;
        }
      }
    }
    if (hit) {
      out.push(hit);
      i += hit.idxs.length;
    } else i += 1;
  }
  return out;
}

/** Ключ для имени из текста: «Jon's» → «jon», «Night’s Watch» → «night's watch». */
export const keyOfSurface = (surface) => normKey(bare(normKey(surface)));
