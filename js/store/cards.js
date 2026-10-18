// cards.js — словарь пользователя (карточки) и очередь повторения.
import { db } from "../db.js";
import { lemmaCandidates, norm } from "../lex.js";
import * as levels from "../levels.js";
import { capOf, isWritten } from "../modes.js";
import { leeches } from "../leech.js";
import { reviewCap, takeToday, normalizeDaily, EXTRA_STEP } from "../pacing.js";
import { app, emit, today } from "./state.js";

// ── Словарь пользователя ──────────────────────────────────────────────────
export function resolveWord(raw) {
  const fromGlossary = app.glossary.lookupWord(raw);
  if (fromGlossary) {
    // Слово, добавленное раньше под своей формой (said, found), а начальной формы в словаре у вас нет: остаётся при своей карточке,
    // иначе в тексте оно перестало бы выглядеть добавленным
    const own = app.glossary.words.get(norm(raw));
    if (own && own !== fromGlossary && app.cards.has(own.id) && !app.cards.has(fromGlossary.id)) return own;
    return fromGlossary;
  }
  for (const c of lemmaCandidates(raw)) {
    const card = app.cards.get(`w:${c}`);
    if (card) return card;
  }
  return null;
}

export const cardFor = (entry) => (entry ? app.cards.get(entry.id) : undefined);

/**
 * Добавляет слово в словарь (или дописывает предложение к имеющемуся). opts.srs — готовый уровень вместо «нового» (js/freqdeck.js).
 * opts.src и opts.series (только у новой карточки): откуда слово и какой серией «Пополнить словарь» добавлено; по ним работают фильтр
 * «Из проверки» и кнопка «Убрать всё добавленное этой серией».
 */
export async function saveCard(entry, ctx, { srs, src, series } = {}) {
  let c = app.cards.get(entry.id);
  if (!c) {
    c = {
      id: entry.id,
      w: entry.w,
      t: entry.t,
      pos: entry.pos || "",
      ru: entry.ru || "",
      rm: entry.ru ? "" : entry.rm || "",
      en: entry.en || "",
      ex: entry.ex || "",
      custom: !!entry.custom,
      ctx: [],
      srs: srs || levels.newSrs(),
      added: Date.now(),
      ...(src ? { src } : {}),
      ...(series ? { series } : {}),
    };
  }
  if (ctx && !c.ctx.some((x) => x.s === ctx.s)) {
    c.ctx.push(ctx);
    if (c.ctx.length > 5) c.ctx.splice(1, 1); // первый контекст сохраняем всегда
  }
  app.cards.set(c.id, c);
  await db.put("cards", c);
  emit();
  return c;
}

export async function updateCard(id, patch) {
  const c = app.cards.get(id);
  if (!c) return;
  Object.assign(c, patch);
  await db.put("cards", c);
  emit();
}

export async function removeCard(id) {
  app.cards.delete(id);
  await db.del("cards", id);
  emit();
}

/** Убирает несколько слов за один раз (и один раз перерисовывает экран). Возвращает, сколько убрано. */
export async function removeCards(ids) {
  const gone = [...new Set(ids)].filter((id) => app.cards.has(id));
  if (!gone.length) return 0;
  await db.delMany("cards", gone); // одной записью, как putMany: сотни слов за раз
  gone.forEach((id) => app.cards.delete(id));
  emit();
  return gone.length;
}

/** Меняет несколько слов сразу: patch — объект полей или функция (карточка → поля). Возвращает, сколько изменено. */
export async function patchCards(ids, patch) {
  const changed = [];
  for (const id of new Set(ids)) {
    const c = app.cards.get(id);
    if (!c) continue;
    changed.push({ ...c, ...(typeof patch === "function" ? patch(c) : patch) });
  }
  if (!changed.length) return 0;
  await db.putMany("cards", changed);
  for (const c of changed) app.cards.set(c.id, c);
  emit();
  return changed.length;
}

/** Свой перевод вместо словарного. Пустой перевод не сохраняется. Возвращает true, если перевод изменён. */
export async function setTranslation(id, text) {
  const ru = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!ru || !app.cards.has(id)) return false;
  await updateCard(id, { ru, rm: "", edited: true });
  return true;
}

/** «Моя ассоциация»: короткая запоминалка к слову. */
export const setMnemonic = (id, text) => updateCard(id, { mnemonic: String(text || "").replace(/\s+/g, " ").trim().slice(0, 200) });

/** «Это имя, не повторять»: слово остаётся в словаре, но из повторения уходит. Уровни при этом не трогаются. */
export const setSkip = (id, skip) => updateCard(id, { skip: !!skip });

// ── Повторение ────────────────────────────────────────────────────────────
/** Сколько сейчас трудных слов (js/leech.js). */
export const hardCount = () => leeches([...app.cards.values()]).length;

/** Что сегодня уже сделано (js/pacing.js); после 4:00 начинается новый учебный день, и счётчики обнуляются. */
function todayDaily() {
  if (app.daily.day !== today()) app.daily = normalizeDaily(null, today());
  return app.daily;
}

/**
 * Очередь повторения. scope: 'all' | 'w' | 'pv' | 'id' | 'hard' (трудные слова: все, не только те, что пора повторять).
 * Слова, помеченные «Это имя, не повторять», в очередь не попадают.
 * За день предлагается не больше reviewsPerDay разных карточек (js/pacing.js): остальные просроченные (те, срок которых
 * пришёл позже) ждут следующего дня (held). Новые слова ограничены newPerDay отдельно. Возвращает { due, fresh, list, held }.
 */
export function queue(scope = "all", now = Date.now()) {
  const live = [...app.cards.values()].filter((c) => !c.skip);
  if (scope === "hard") {
    const hard = leeches(live);
    return { due: hard, fresh: [], list: hard, held: 0 };
  }
  const all = live.filter((c) => scope === "all" || c.t === scope);
  const overdue = all.filter((c) => !levels.isNew(c.srs) && c.srs.due <= now).sort((a, b) => a.srs.due - b.srs.due);
  const daily = todayDaily();
  const { list: due, held } = takeToday(overdue, daily, reviewCap(app.settings));
  const left = Math.max(0, app.settings.newPerDay - daily.newDone);
  const fresh = all.filter((c) => levels.isNew(c.srs)).sort((a, b) => a.added - b.added).slice(0, left);
  return { due, fresh, list: [...due, ...fresh], held };
}

/** «Ещё»: добавить к сегодняшнему лимиту повторений ещё EXTRA_STEP карточек. */
export async function addReviewExtra() {
  const d = todayDaily();
  d.extra += EXTRA_STEP;
  await db.put("kv", { key: "daily", value: d });
  emit();
}

/**
 * Записать ответ на карточку. result: 'ok' | 'near' | 'no'; task: задание (js/modes.js), по нему определяется, письменное оно
 * и до какого уровня поднимает слово; ctxText: предложение, которое только что показывали (чтобы в следующий раз взять другое);
 * ms: сколько длился ответ (в журнал, пользователю не показывается); lapse: false, если это повтор после ошибки в том же заходе
 * (вторая ошибка по тому же слову за заход уровень не снижает и «трудным» слово не делает: штраф уже получен).
 * Повторение раньше срока (например, трудные слова вне очереди) уровень не поднимает и срок не двигает.
 * Возвращает { card, before, after }: уровень до и после ответа (для индикатора).
 */
export async function answerCard(id, result, { task = "", written, now = Date.now(), ctxText = "", ms = null, lapse = true } = {}) {
  const c = app.cards.get(id);
  const before = c.srs.lv;
  const wr = written ?? isWritten(task);
  const early = before > 0 && c.srs.due > now;
  if (early && result !== "no") c.srs = { ...c.srs, last: now, reps: (c.srs.reps || 0) + 1 };
  else c.srs = levels.answer(c.srs, result, { written: wr, now, cap: capOf(task), repeat: !lapse });
  if (ctxText) c.lastCtx = ctxText;
  await db.put("cards", c);
  await db.add("log", { id, t: now, result, written: wr, task, lv: c.srs.lv, v: levels.LADDER, ...(Number.isFinite(ms) ? { ms: Math.round(ms) } : {}) });
  // счётчики дня: новое слово не считается в лимит повторений, повторённая в срок карточка считается один раз за день
  const d = todayDaily();
  let counted = false;
  if (before === 0) {
    d.newDone += 1;
    d.nw.push(id);
    counted = true;
  } else if (!early && !d.nw.includes(id) && !d.rev.includes(id)) {
    d.rev.push(id);
    counted = true;
  }
  if (counted) await db.put("kv", { key: "daily", value: d });
  emit();
  return { card: c, before, after: c.srs.lv };
}

/** «Знаю»: слово не предлагается в списке «Слова этой книги». В словарь оно при этом не попадает. */
export async function markKnown(id) {
  if (app.known.has(id)) return;
  app.known.add(id);
  await db.put("kv", { key: "known", value: [...app.known] });
}
