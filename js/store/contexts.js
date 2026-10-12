// contexts.js — поиск в загруженных книгах предложений со словами пользователя (для заданий «Слово в предложении»).
import { db } from "../db.js";
import { contextPool, scanBook, mergeFound, ENOUGH } from "../context.js";
import { app } from "./state.js";
import { dictionaryReady } from "./lexicon.js";
import { bookZip } from "./books.js";

// ── Предложения для задания «Слово в предложении» ────────────────────────
let scanning = false;
let again = false; // пока шёл просмотр, слова добавили или книгу сменили: после просмотра он повторяется

/**
 * Ищет в загруженных книгах другие предложения со словами из словаря, чтобы пропуск не повторял одно и то же предложение.
 * Идёт в фоне: по каждой книге один просмотр для всех слов, которым не хватает предложений. Найденное хранится у карточки
 * (found), а просмотренные книги запоминаются (scanned), так что каждая книга просматривается для слова один раз.
 */
export async function ensureContexts() {
  if (scanning) {
    again = true;
    return;
  }
  await dictionaryReady();
  if (app.dict.state !== "ready" || scanning) {
    if (scanning) again = true;
    return;
  }
  scanning = true;
  try {
    do {
      again = false;
      await scanPass();
    } while (again);
  } finally {
    scanning = false;
  }
}

/** Один проход по книгам: для каждой книги один просмотр сразу для всех слов, которым не хватает предложений. */
async function scanPass() {
  const short = [...app.cards.values()].filter((c) => !c.skip && contextPool(c, app.glossary).length < ENOUGH);
  for (const b of [...app.books]) {
    const wanted = new Map();
    for (const card of short) {
      if (card.scanned?.includes(b.id) || app.cards.get(card.id) !== card) continue;
      wanted.set(card.id, { card, known: new Set([...(card.ctx || []), ...(card.found || [])].map((x) => x.s)) });
    }
    if (!wanted.size) continue;
    try {
      const zip = await bookZip(b.id);
      const picks = await scanBook({ book: b, zip, wanted, glossary: app.glossary });
      for (const [id, { card }] of wanted) {
        if (app.cards.get(id) !== card) continue; // слово удалили, пока шёл просмотр
        const got = picks.get(id);
        if (got?.length) card.found = mergeFound(card.found, got);
        card.scanned = [...(card.scanned || []), b.id];
        await db.put("cards", card);
      }
    } catch {
      /* книга не открылась: попробуем в другой раз */
    }
  }
}
