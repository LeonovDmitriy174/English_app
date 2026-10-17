import test from "node:test";
import assert from "node:assert/strict";
import { PHRASE_GROUPS } from "../js/phrasedata.js";
import { phraseDeck, phraseKey, emptyState, normalizeState, mergeStates, markDone, doneCount, overview, queueFor, nextGroup, splitExample } from "../js/phrasedeck.js";
import { buildChoices } from "../js/choices.js";
import { usable, exactForm } from "../js/context.js";

const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const deck = phraseDeck();

test("колода: около четырёхсот фраз в двенадцати темах, ни одна строка не потеряна при разборе", () => {
  assert.ok(deck.items.length >= 380, `фраз: ${deck.items.length}`);
  assert.equal(deck.groups.length, 12);
  const lines = PHRASE_GROUPS.flatMap((g) => g.lines.split("\n").filter((l) => l.trim()));
  assert.equal(deck.items.length, lines.length, "каждая строка стала фразой (нет повторов и пустых полей)");
  for (const g of deck.groups) assert.ok(g.items.length >= 25 && g.items.length <= 60, `${g.name}: ${g.items.length}`);
  assert.equal(phraseDeck(), phraseDeck(), "разбор кэшируется");
});

test("у каждой строки три части, а фраза и перевод не повторяются в колоде", () => {
  const phrases = new Set();
  const ru = new Map();
  for (const g of PHRASE_GROUPS) {
    for (const raw of g.lines.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split("|").map((x) => x.trim());
      assert.equal(parts.length, 3, `ровно три части: ${line}`);
      const [w, tr, ex] = parts;
      assert.ok(w && tr && ex, line);
      assert.ok(!phrases.has(phraseKey(w)), `повтор фразы: ${w}`);
      phrases.add(phraseKey(w));
      const k = tr.toLowerCase().replace(/[?!.,]/g, "");
      assert.ok(!ru.has(k), `одинаковый перевод у «${w}» и «${ru.get(k)}»: ${tr}`);
      ru.set(k, w);
    }
  }
});

test("записи колоды: тип идиомы, часть речи phrase, перевод и пример есть", () => {
  for (const e of deck.items) {
    assert.equal(e.t, "id");
    assert.equal(e.pos, "phrase");
    assert.equal(e.id, `id:${phraseKey(e.w)}`);
    assert.ok(e.ru && e.ex, e.w);
    assert.match(e.w, /^[A-Za-z][A-Za-z' ,-]*$/, `фраза без знаков в конце: ${e.w}`);
    assert.ok(!/[A-Z]/.test(e.w.replace(/\bI\b|\bI(?='[a-z]+)|\b(English|God|French)\b/g, "")), `строчные буквы, кроме «I» и имён собственных: ${e.w}`);
  }
  assert.equal(deck.byId.get("id:how's it going").ru, "Как дела?");
});

test("пример содержит саму фразу, и из него строится пропуск для задания «Слово в предложении»", () => {
  for (const e of deck.items) {
    const parts = splitExample(e);
    assert.ok(parts, `в примере нет фразы «${e.w}»: ${e.ex}`);
    assert.equal(parts.join(""), e.ex);
    assert.equal(phraseKey(parts[1]), phraseKey(e.w));
    const ctx = { s: e.ex, a: parts[0].length, b: parts[0].length + parts[1].length };
    assert.ok(usable(ctx, e), `пропуск годится: ${e.w}`);
    assert.ok(exactForm(ctx, e), `форма в примере та же: ${e.w}`);
    const before = parts[0];
    const after = parts[2];
    assert.ok(!/\p{L}$/u.test(before) && !/^\p{L}/u.test(after), `фраза стоит отдельными словами: ${e.w} в «${e.ex}»`);
  }
});

test("у каждой фразы находятся неверные переводы из колоды, без общих слов с верным", () => {
  const rnd = seeded(9);
  for (const e of deck.items) {
    const built = buildChoices(e, deck.glossary, [], { rng: rnd });
    assert.ok(built && built.options.length === 4, `четыре варианта у «${e.w}»`);
    assert.equal(built.options.filter((o) => o.ok).length, 1);
    const right = built.options.find((o) => o.ok).text;
    const words = (s) => new Set(s.toLowerCase().match(/\p{L}{3,}/gu) || []);
    for (const o of built.options.filter((x) => !x.ok)) assert.ok(![...words(o.text)].some((w) => words(right).has(w)), `«${o.text}» рядом с «${right}»`);
  }
});

test("состояние: нормализация, слияние, подсчёт", () => {
  assert.deepEqual(normalizeState(null), emptyState());
  assert.deepEqual(normalizeState({ done: { "id:no way": 1, "w:bad": 1, "id:x": 0, "": 1 } }).done, { "id:no way": 1 }, "только фразы с отметкой");
  const a = markDone(emptyState(), "id:no way");
  const b = markDone(emptyState(), "id:small world");
  assert.deepEqual(Object.keys(mergeStates(a, b).done).sort(), ["id:no way", "id:small world"]);
  assert.deepEqual(mergeStates(a, undefined).done, a.done);
  assert.equal(doneCount(mergeStates(a, { done: { "id:не такой фразы": 1 } }), deck), 1, "фразы, которых нет в колоде, не считаются");
});

test("сводка по темам и очередь захода", () => {
  const s = emptyState();
  const first = deck.groups[0];
  first.items.slice(0, 5).forEach((e) => markDone(s, e.id));
  const o = overview(s, deck);
  assert.equal(o.total, deck.items.length);
  assert.equal(o.done, 5);
  assert.equal(o.groups[0].checked, 5);
  assert.ok(!o.groups[0].complete && !o.finished);
  const q = queueFor(deck, s, "all");
  assert.equal(q.length, deck.items.length - 5);
  assert.equal(q[0], first.items[5], "очередь идёт с первой непроверенной фразы");
  assert.equal(queueFor(deck, s, deck.groups[1].key).length, deck.groups[1].items.length);
  assert.deepEqual(queueFor(deck, s, "нет-такой"), []);
  assert.equal(queueFor(deck, s, first.key, { restart: true }).length, first.items.length, "«заново»: вся тема");
  deck.items.forEach((e) => markDone(s, e.id));
  assert.ok(overview(s, deck).finished);
  assert.deepEqual(queueFor(deck, s), []);
});

test("следующая тема: первая после текущей, где ещё есть что проверять", () => {
  const s = emptyState();
  deck.groups[1].items.forEach((e) => markDone(s, e.id));
  assert.equal(nextGroup(deck, s, deck.groups[0].key).key, deck.groups[2].key, "вторая пройдена, берём третью");
  deck.items.forEach((e) => markDone(s, e.id));
  assert.equal(nextGroup(deck, s, deck.groups[0].key), null, "всё пройдено");
  const only = emptyState();
  deck.items.filter((e) => e.group !== deck.groups[3].key).forEach((e) => markDone(only, e.id));
  assert.equal(nextGroup(deck, only, deck.groups[3].key), null, "в той же теме больше нечего");
  assert.equal(nextGroup(deck, only, deck.groups[0].key).key, deck.groups[3].key, "обходит круг");
});

test("пример с выделенной фразой", () => {
  assert.deepEqual(splitExample({ w: "how's it going", ex: "Hey, Tom! How's it going?" }), ["Hey, Tom! ", "How's it going", "?"]);
  assert.equal(splitExample({ w: "no way", ex: "Nothing here." }), null);
  assert.equal(phraseKey("  Night’s   Watch "), "night's watch");
});
