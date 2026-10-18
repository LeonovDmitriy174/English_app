// replenish.js (store) — «Топ слов по частотности»: где остановилась проверка, свой список слов и то, как ответ меняет словарь.
// Правила ответов (что добавить, что оставить, что опустить) живут в js/freqdeck.js (decide); здесь они применяются к карточкам.
import { db } from "../db.js";
import * as levels from "../levels.js";
import { isSlow } from "../pace.js";
import { FREQ_TASK, decide, addedSrs, normalizeState, mergeStates } from "../freqdeck.js";
import { reviewCap, dueLoad, spreadBudget } from "../pacing.js";
import * as phrasedeck from "../phrasedeck.js";
import { app } from "./state.js";
import { saveCard, answerCard, removeCards } from "./cards.js";

const FREQ_SRC = "freq"; // метка в карточке: слово добавила проверка
const STATE_KEY = "freqdeck"; // где остановилась проверка и как сданы тесты
const OWN_KEY = "freqown"; // свой список слов (загружается файлом)
const FILE_URL = "data/freq.json"; // список, который собрал tools/build_freq.py
const MAX_OWN_WORDS = 20000;

let state = null;

/** Состояние проверки; читается с устройства один раз, дальше живёт в памяти. */
export async function loadFreqState() {
  if (!state) state = normalizeState((await db.get("kv", STATE_KEY))?.value);
  return state;
}

export async function saveFreqState() {
  if (state) await db.put("kv", { key: STATE_KEY, value: state });
}

/** Свой список слов: { words, name, at } или null. */
export async function loadOwnList() {
  const v = (await db.get("kv", OWN_KEY))?.value;
  return Array.isArray(v?.words) && v.words.length ? v : null;
}

export async function saveOwnList({ words, name = "", at = Date.now() }) {
  const clean = (words || []).filter((w) => typeof w === "string").slice(0, MAX_OWN_WORDS);
  if (!clean.length) return false;
  await db.put("kv", { key: OWN_KEY, value: { words: clean, name: String(name).slice(0, 80), at } });
  return true;
}

export const clearOwnList = () => db.del("kv", OWN_KEY);

let fileList = null;
/** Список из data/freq.json: { words, src, built }. Если файла нет (или он пуст), words пустой, и порядок берётся из словаря. */
export async function loadFreqFile() {
  if (fileList) return fileList;
  let words = [];
  let meta = {};
  try {
    const res = await fetch(FILE_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.words)) words = data.words.filter((w) => typeof w === "string");
      meta = { src: String(data?.src || ""), built: String(data?.built || "") };
    }
  } catch {
    /* без файла работает запасной порядок по частоте из словаря */
  }
  fileList = { words, ...meta };
  return fileList;
}

/**
 * План разброса сроков для серии ответов: сколько карточек уже приходится на каждый день и сколько можно добавить на день
 * (js/pacing.js). Создаётся при старте серии или теста и передаётся в replenishAnswer, чтобы слова, добавленные за заход,
 * не вернулись все в один день.
 */
export const newSpreadPlan = () => ({ load: dueLoad(app.cards.values()), budget: spreadBudget(reviewCap(app.settings)) });

/**
 * Применяет ответ на слово к словарю по правилам js/freqdeck.js. entry — запись общего словаря, ok — выбран верный перевод,
 * ms — сколько длился ответ (очень медленный верный ответ даёт не «знакомое» слово, а «учу»; правило скорости отключается в настройках словаря),
 * plan — план разброса сроков (newSpreadPlan); без него срок добавленного слова случайный от 3 до 5 суток;
 * series — метка серии: карточка запоминает, каким заходом добавлена (undoSeries).
 * Каждый ответ пишется в журнал с меткой FREQ_TASK: серия дней его видит, а «повторениями» и точностью он не считается.
 * Возвращает { kind, card, slow }: kind «add» | «fresh» | «keep» | «drop».
 */
export async function replenishAnswer(entry, ok, { ms = null, now = Date.now(), rng = Math.random, plan = null, series = "" } = {}) {
  const card = app.cards.get(entry.id);
  const slow = ok && app.settings.speedRule !== false && isSlow("choice", ms);
  const act = decide({ card, ok, slow });
  let saved = card;
  if (act.kind === "add") saved = await saveCard(entry, null, { srs: addedSrs(now, act.lv, { rng, ...(plan || {}) }), src: FREQ_SRC, series });
  else if (act.kind === "fresh") saved = await saveCard(entry, null, { src: FREQ_SRC, series });
  if (act.kind === "drop") {
    // обычная ошибка по слову: уровень падает на два, срок сбрасывается, запись в журнале делает answerCard
    await answerCard(entry.id, "no", { task: FREQ_TASK, now, ms });
    saved = app.cards.get(entry.id);
  } else {
    await db.add("log", { id: entry.id, t: now, result: ok ? "ok" : "no", written: false, task: FREQ_TASK, lv: saved?.srs?.lv || 0, v: levels.LADDER, ...(Number.isFinite(ms) ? { ms: Math.round(ms) } : {}) });
  }
  return { kind: act.kind, card: saved, slow };
}

/** Новая метка серии: по ней находятся слова, добавленные одним заходом. */
export const newSeriesId = (now = Date.now()) => `s${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/**
 * Убирает из словаря слова, добавленные серией (метка series). Слова, которые вы уже успели повторить в этот день после добавления,
 * тоже уходят: серию отменяют сразу, на экране итогов. Уровни слов, которые уже были в словаре, не восстанавливаются.
 * Возвращает, сколько слов убрано.
 */
export async function undoSeries(series) {
  if (!series) return 0;
  const ids = [...app.cards.values()].filter((c) => c.series === series).map((c) => c.id);
  return removeCards(ids);
}

// ── Разговорные фразы ───────────────────────────────────────────────────────
const PHRASE_KEY = "phrasedeck"; // какие фразы уже проверены (js/phrasedeck.js)
let phraseState = null;

/** Состояние колоды фраз; читается с устройства один раз, дальше живёт в памяти. */
export async function loadPhraseState() {
  if (!phraseState) phraseState = phrasedeck.normalizeState((await db.get("kv", PHRASE_KEY))?.value);
  return phraseState;
}

export async function savePhraseState() {
  if (phraseState) await db.put("kv", { key: PHRASE_KEY, value: phraseState });
}

// ── Резервная копия ─────────────────────────────────────────────────────────
/** Всё, что относится к «Топ слов по частотности» и к разговорным фразам, для файла копии. */
export async function exportReplenish() {
  const own = await loadOwnList();
  const phrases = await loadPhraseState();
  return { state: await loadFreqState(), ...(own ? { own } : {}), ...(Object.keys(phrases.done).length ? { phrases } : {}) };
}

/** Влить в устройство то, что пришло в копии: проверка идёт дальше той, что дальше, тесты берутся лучшие, свой список — если своего нет. */
export async function importReplenish(data) {
  if (!data || typeof data !== "object") return;
  const current = await loadFreqState();
  state = mergeStates(current, data.state);
  await saveFreqState();
  if (data.own && !(await loadOwnList())) await saveOwnList(data.own);
  if (data.phrases) {
    phraseState = phrasedeck.mergeStates(await loadPhraseState(), data.phrases); // проверенные фразы: что отмечено хотя бы там, остаётся отмеченным
    await savePhraseState();
  }
}
