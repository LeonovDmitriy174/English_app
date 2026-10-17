// dictview.js — как показывать словарь: порядок, фильтры по типу, уровню и источнику, поиск. Чистые функции (tests/dictview.test.mjs).
//
// Источник слова определяется по самой карточке: «проверка» — слово добавило «Пополнить словарь» (в карточке стоит src: "freq"),
// «книга» — у слова есть предложение из книги, «вручную» — всё остальное (добавлено поиском или файлом).
import { groupOf, GROUPS } from "./progress.js";

export const SORTS = [
  ["new", "Сначала новые"],
  ["abc", "По алфавиту"],
  ["weak", "Слабые сначала"],
  ["strong", "Сильные сначала"],
];
export const LEVELS = [["all", "Любой"], ...GROUPS.map((g) => [g.key, g.label]), ["skip", "Не повторяются"]];
export const SOURCES = [
  ["all", "Любой"],
  ["book", "Из книг"],
  ["freq", "Из проверки"],
  ["hand", "Вручную"],
];
export const DEFAULTS = { kind: "all", sort: "new", level: "all", source: "all" };

export const sourceOf = (c) => (c?.src === "freq" ? "freq" : c?.ctx?.length ? "book" : "hand");
export const levelKey = (c) => (c?.skip ? "skip" : groupOf(c?.srs?.lv || 0));

/** Карточки, подходящие под тип, уровень, источник и строку поиска (без учёта регистра, по слову и по переводу). */
export function filterCards(cards, { kind = "all", level = "all", source = "all", query = "" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return cards.filter(
    (c) => (kind === "all" || c.t === kind) && (level === "all" || levelKey(c) === level) && (source === "all" || sourceOf(c) === source) && (!q || c.w.toLowerCase().includes(q) || (c.ru || c.rm || c.en || "").toLowerCase().includes(q)),
  );
}

/** Новый массив в нужном порядке; при равенстве всегда сначала добавленные позже. */
export function sortCards(cards, sort = "new") {
  const lv = (c) => c.srs?.lv || 0;
  const byNew = (a, b) => (b.added || 0) - (a.added || 0);
  const by = {
    new: byNew,
    abc: (a, b) => a.w.localeCompare(b.w, "en") || byNew(a, b),
    weak: (a, b) => lv(a) - lv(b) || byNew(a, b),
    strong: (a, b) => lv(b) - lv(a) || byNew(a, b),
  }[sort];
  return [...cards].sort(by || byNew);
}

/** Сколько настроек отличается от обычных (порядок, уровень, источник): число на кнопке «Порядок и фильтры». */
export const activeCount = (v) => (v.sort && v.sort !== DEFAULTS.sort ? 1 : 0) + (v.level && v.level !== DEFAULTS.level ? 1 : 0) + (v.source && v.source !== DEFAULTS.source ? 1 : 0);

const labelOf = (list, key) => list.find(([k]) => k === key)?.[1] || "";

/** Короткая подпись выбранного: «Слабые сначала · Учу · Из книг» (то, что отличается от обычного). */
export function describe(v) {
  return [v.sort !== DEFAULTS.sort && labelOf(SORTS, v.sort), v.level !== DEFAULTS.level && labelOf(LEVELS, v.level), v.source !== DEFAULTS.source && labelOf(SOURCES, v.source)].filter(Boolean).join(" · ");
}
