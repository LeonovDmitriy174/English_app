// reading.js — сколько прочитано: доля книги, отметка «прочитана», сколько слов прочитано. Чистые функции без DOM (tests/reading.test.mjs).
//
// Место в книге хранится как book.progress = { ch, p, f?, done? }: номер главы, абзац, доля прокрутки внутри главы (0…1) и время отметки «прочитана».
// Доля книги считается по длине глав в знаках, а не по числу глав: короткая последняя глава не «весит» как длинная первая.

export const ALMOST = 0.97; // с какой доли книга считается дочитанной, даже если до самого конца не долистали (в конце часто лежит лицензия или реклама)
export const CHARS_PER_WORD = 5.9; // запасная оценка, пока книга не разобрана: знаков в английском слове вместе с пробелом и знаками препинания
const END_PX = 48; // сколько пикселей до низа главы считается «дошли до конца»

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export const totalChars = (book) => (book?.chapters || []).reduce((sum, c) => sum + (c.chars || 0), 0);

/** Номер главы, на которой остановились (всегда существующий). */
export const chapterIndex = (book) => clamp(Math.floor(book?.progress?.ch ?? 0), 0, Math.max(0, (book?.chapters?.length || 1) - 1));

/**
 * Где вы в книге: доля от 0 до 1 по длине глав. Если доля прокрутки внутри главы неизвестна (запись из прежней версии),
 * считаем, что вы на середине главы, когда абзац не первый.
 */
export function readFraction(book) {
  const chapters = book?.chapters || [];
  const total = totalChars(book);
  if (!chapters.length) return 0;
  const ch = chapterIndex(book);
  if (!total) return chapters.length > 1 ? ch / (chapters.length - 1) : 0; // нет сведений о длине: по числу глав
  const within = Number.isFinite(book.progress?.f) ? clamp(book.progress.f) : book.progress?.p ? 0.5 : 0;
  let before = 0;
  for (let i = 0; i < ch; i++) before += chapters[i].chars || 0;
  return clamp((before + (chapters[ch].chars || 0) * within) / total);
}

/** Место из копии данных поверх нынешнего: берётся то, что в копии, но отметка «прочитана» не теряется, если она уже стояла. */
export function mergeProgress(mine, theirs) {
  const next = { ...(theirs && typeof theirs === "object" ? theirs : mine || { ch: 0, p: 0 }) };
  const marks = [mine?.done, theirs?.done].filter((x) => Number.isFinite(x) && x > 0);
  if (marks.length) next.done = Math.min(...marks);
  else delete next.done;
  return next;
}

/** Для строки книги и «Продолжить чтение»: глава, всего глав, процент по длине глав и отметка «прочитана». */
export function bookProgress(book) {
  const total = book?.chapters?.length || 0;
  const finished = isFinished(book);
  return { ch: chapterIndex(book), total, pct: finished ? 100 : Math.round(readFraction(book) * 100), finished };
}

/** Книга отмечена прочитанной (само при дочтении до конца или кнопкой в меню книги). */
export const isFinished = (book) => !!book?.progress?.done;

/** Дочитали ли до конца: последняя глава, и до низа осталось немного. maxScroll = высота текста минус высота экрана. */
export const atEnd = (chIdx, chapterCount, scrollTop, maxScroll) => chIdx >= chapterCount - 1 && maxScroll - scrollTop <= END_PX;

/** Пора ли отметить книгу прочитанной по доле: у длинных книг в конце бывает лицензия, и до самого низа не долистывают. */
export const almostDone = (book) => readFraction(book) >= ALMOST && chapterIndex(book) >= (book.chapters?.length || 1) - 2;

/** Сколько слов в книге: из разбора, а пока его нет, по числу знаков. */
export const bookWords = (book) => (Number.isFinite(book?.stats?.tokens) && book.stats.tokens > 0 ? book.stats.tokens : Math.round(totalChars(book) / CHARS_PER_WORD));

/** Сколько слов этой книги прочитано (по месту, где вы остановились; прочитанная книга считается целиком). */
export function wordsRead(book) {
  const total = bookWords(book);
  return Math.round(total * (isFinished(book) ? 1 : readFraction(book)));
}

export const MAX_STEP_WORDS = 1200; // за один сдвиг вперёд больше не считаем: это прыжок по оглавлению, а не чтение

/**
 * Сколько слов прочитано при сдвиге места с from на to ({ ch, p, f? }): нужно для темпа чтения. Назад и на слишком большой шаг — 0
 * (прыжок вперёд по оглавлению или по заметке не считается чтением).
 */
export function wordsStep(book, from, to) {
  const delta = (readFraction({ ...book, progress: to }) - readFraction({ ...book, progress: from })) * bookWords(book);
  return delta > 0 && delta <= MAX_STEP_WORDS ? delta : 0;
}

/** Сводка по полке: сколько книг прочитано, сколько читается сейчас и сколько слов прочитано всего. */
export function shelfStats(books) {
  let finished = 0;
  let reading = 0;
  let words = 0;
  for (const b of books || []) {
    if (isFinished(b)) finished += 1;
    else if (readFraction(b) > 0.005 || b.progress?.ch > 0 || b.opened) reading += 1;
    words += wordsRead(b);
  }
  return { total: (books || []).length, finished, reading, words };
}

/** Короткая запись числа слов: «820», «12 тыс.», «1,4 млн». */
export function fmtWords(n) {
  if (n < 1000) return String(Math.round(n));
  if (n < 100000) return `${(Math.round(n / 100) / 10).toLocaleString("ru-RU")} тыс.`;
  if (n < 1000000) return `${Math.round(n / 1000)} тыс.`;
  return `${(Math.round(n / 100000) / 10).toLocaleString("ru-RU")} млн`;
}

/**
 * Что запомнить об удаляемой книге, чтобы после повторного добавления вернуться на то же место: { ch, p, f?, done? }
 * или null, если книгу ещё не начинали (запоминать нечего).
 */
export function placeToKeep(book) {
  const p = book?.progress;
  if (!p || !(p.ch > 0 || p.p > 0 || p.f > 0 || p.done)) return null;
  return { ch: p.ch || 0, p: p.p || 0, ...(Number.isFinite(p.f) ? { f: p.f } : {}), ...(p.done ? { done: p.done } : {}) };
}
