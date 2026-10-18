// records.js — записи из хранилища (IndexedDB) перед использованием приводятся к допустимому виду.
// Приложение само пишет в базу записи правильной формы, но база живёт годами: прежние версии писали иначе, запись могла оборваться
// при нехватке места, а копия данных приходит из файла. Одна испорченная запись не должна делать приложение неоткрываемым:
// книга без списка глав, карточка без слова или пустая строка журнала просто пропускаются или исправляются.
// Чистые функции без DOM (tests/records.test.mjs). Сами записи в базе не меняются: исправленный вид получается при загрузке.

export const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x, fallback = "") => (typeof x === "string" ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : fallback);
const num = (x, fallback = 0) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
const int = (x, fallback = 0) => Math.max(0, Math.floor(num(x, fallback)));
const strings = (xs) => (Array.isArray(xs) ? xs.filter((s) => typeof s === "string") : []);

const CARD_TYPES = new Set(["w", "pv", "id"]);

/** Карточка слова или null, если это не карточка (нет названия слова). Исправная карточка возвращается как есть. */
export function sanitizeCard(raw) {
  if (!isObject(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.w !== "string" || !raw.w.trim()) return null;
  const textOk = ["pos", "ru", "rm", "en", "ex"].every((k) => raw[k] === undefined || typeof raw[k] === "string");
  const ctxOk = raw.ctx === undefined || (Array.isArray(raw.ctx) && raw.ctx.every((x) => isObject(x) && typeof x.s === "string"));
  if (CARD_TYPES.has(raw.t) && textOk && ctxOk) return raw;
  const out = { ...raw, t: CARD_TYPES.has(raw.t) ? raw.t : raw.id.slice(0, raw.id.indexOf(":")) || "w" };
  if (!CARD_TYPES.has(out.t)) out.t = "w";
  for (const k of ["pos", "ru", "rm", "en", "ex"]) if (out[k] !== undefined && typeof out[k] !== "string") out[k] = str(out[k]);
  if (!ctxOk) out.ctx = (Array.isArray(raw.ctx) ? raw.ctx : []).filter((x) => isObject(x) && typeof x.s === "string");
  return out;
}

const STATS_ARRAYS = ["freq", "unknown", "top", "names", "nameCounts"];

/** Разбор книги пригоден, если все списки на месте; иначе он выбрасывается и книга разбирается заново. */
export function validStats(st) {
  if (!isObject(st) || typeof st.sig !== "string") return false;
  if (!STATS_ARRAYS.every((k) => Array.isArray(st[k]))) return false;
  if (!["tokens", "unique", "coverage", "base", "outside", "uniqueUnknown"].every((k) => Number.isFinite(st[k]))) return false;
  const pairs = (xs) => xs.every((p) => Array.isArray(p) && typeof p[0] === "string" && Number.isFinite(p[1]));
  return pairs(st.freq) && pairs(st.unknown) && pairs(st.top) && pairs(st.nameCounts) && st.names.every((n) => typeof n === "string") && isObject(st.phrases);
}

/** Книга или null, если это не книга (нет номера). Исправная книга возвращается как есть. */
export function sanitizeBook(raw) {
  if (!isObject(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const chaptersOk = Array.isArray(raw.chapters) && raw.chapters.every((c) => isObject(c) && typeof c.href === "string" && typeof c.title === "string" && Number.isFinite(c.chars));
  const progressOk = isObject(raw.progress) && Number.isFinite(raw.progress.ch) && Number.isFinite(raw.progress.p);
  const textOk = typeof raw.title === "string" && (raw.author === undefined || typeof raw.author === "string");
  const groupsOk = raw.groups === undefined || (Array.isArray(raw.groups) && raw.groups.every((g) => typeof g === "string"));
  const statsOk = raw.stats === undefined || validStats(raw.stats);
  const datesOk = ["added", "opened"].every((k) => raw[k] === undefined || Number.isFinite(raw[k]));
  if (chaptersOk && progressOk && textOk && groupsOk && statsOk && datesOk) return raw;
  const out = { ...raw };
  out.title = str(raw.title, "Без названия") || "Без названия";
  if (raw.author !== undefined) out.author = str(raw.author);
  out.chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .filter((c) => isObject(c) && typeof c.href === "string")
    .map((c) => ({ ...c, href: c.href, title: str(c.title), chars: Math.max(0, num(c.chars)) }));
  const p = isObject(raw.progress) ? raw.progress : {};
  out.progress = { ...p, ch: int(p.ch), p: int(p.p) };
  if (p.f !== undefined && !Number.isFinite(p.f)) delete out.progress.f;
  if (p.done !== undefined && !Number.isFinite(p.done)) delete out.progress.done;
  if (raw.groups !== undefined) out.groups = strings(raw.groups);
  if (raw.stats !== undefined && !validStats(raw.stats)) out.stats = undefined;
  for (const k of ["added", "opened"]) if (out[k] !== undefined && !Number.isFinite(out[k])) delete out[k];
  return out;
}

/** Строки журнала ответов, которые можно читать: объект с номером слова и временем. */
export const cleanLog = (rows) => (Array.isArray(rows) ? rows.filter((r) => isObject(r) && typeof r.id === "string" && Number.isFinite(r.t)) : []);
