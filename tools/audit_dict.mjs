#!/usr/bin/env node
// Проверка настоящего словаря (data/dict.json). Ловит ошибки данных, которые тесты на маленьком образце не видят:
// формы слов, которые ведут к чужому смыслу, список «Пополнить словарь» с формами вместо слов, обломки разметки в переводах.
//
// Запуск:  node tools/audit_dict.mjs [путь/к/dict.json]      (или  npm run audit:dict)
// Если рядом со словарём лежит собранный частотный список (data/freq.json, tools/build_freq.py), проверяется и он.
// Выход: 0, если ошибок нет; 1, если есть (предупреждения не считаются). Пробный образец (меньше 2000 слов) пропускается.
// Выполняется и при публикации (.github/workflows/pages.yml), и после каждой пересборки словаря стоит прогнать руками.
// Сама проверка — функция audit(), её испытывает tests/auditdict.test.mjs на словаре с намеренными дефектами.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Glossary, lemmaCandidates } from "../js/lex.js";
import { rankFromDictionary, buildRanking, usable, isPlainWord, SIZE } from "../js/freqdeck.js";
import { families } from "../js/families.js";
import { phraseDeck } from "../js/phrasedeck.js";

const list = (xs, n = 8) => xs.slice(0, n).join(", ") + (xs.length > n ? `, … (+${xs.length - n})` : "");

/** Проверяет список записей словаря и, если он есть, частотный список freq ({ words, src, built }). Возвращает { skipped, errors, warnings, summary }. */
export function audit(raw, freq = null) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);
  const wordCount = raw.filter((e) => e?.t === "w").length;
  if (wordCount < 2000) return { skipped: true, wordCount, errors, warnings, summary: [] };

  // ── 1. Устройство записей ───────────────────────────────────────────────────
  const seen = new Set();
  const dup = [];
  const badShape = [];
  for (const e of raw) {
    if (!e || !["w", "pv", "id"].includes(e.t) || typeof e.w !== "string" || !e.w.trim() || e.w !== e.w.trim()) {
      badShape.push(JSON.stringify(e)?.slice(0, 60));
      continue;
    }
    const id = `${e.t}:${e.w}`;
    if (seen.has(id)) dup.push(id);
    seen.add(id);
    if (e.m && (!Array.isArray(e.m) || e.m.some((p) => typeof p !== "string"))) badShape.push(`${id}: шаблоны m`);
    if (e.f && (!Array.isArray(e.f) || e.f.some((p) => typeof p !== "string"))) badShape.push(`${id}: формы f`);
    if (e.of && (!Array.isArray(e.of) || e.of.some((p) => typeof p !== "string"))) badShape.push(`${id}: of`);
    if (e.t === "w" && /[A-Z\s]/.test(e.w.replace(/ /g, "")) && !/^[a-z'-]+$/.test(e.w) && !/\s/.test(e.w)) warn(`слово с необычными знаками: ${e.w}`);
  }
  if (badShape.length) err(`записи неправильного вида: ${list(badShape)}`);
  if (dup.length) err(`повторяются записи: ${list(dup)}`);

  // ── 2. Словарь глазами приложения (после очистки и исправлений при загрузке) ───
  const t0 = performance.now();
  const g = new Glossary(raw);
  const ms = Math.round(performance.now() - t0);
  const words = g.list.filter((e) => e.t === "w");

  const entity = g.list.filter((e) => ["ru", "rm", "en", "ex"].some((k) => /&(?:lt|gt|amp|quot|apos|nbsp|#\d+);/.test(e[k] || "")));
  if (entity.length) err(`в переводах остались HTML-сущности: ${list(entity.map((e) => e.w))}`);
  const markup = words.filter((e) => /[<>{}]|\[\[|\]\]/.test(e.ru || ""));
  if (markup.length) err(`в переводах остались обломки разметки: ${list(markup.map((e) => e.w))}`);
  const withoutZ = words.filter((e) => !Number.isFinite(e.z));
  if (withoutZ.length > words.length * 0.02) err(`у ${withoutZ.length} слов нет оценки частоты z: словарь собран без неё, пересоберите`);

  // Самые частые слова должны иметь настоящий перевод, а не обрывки примеров
  // Видимые слова: те, что приложение открывает по их написанию (формы вроде was и said ведут к другим записям и сами не видны)
  const visible = words.filter((e) => isPlainWord(e.w) && g.lookupWord(e.w) === e);
  const frequent = visible.filter((e) => e.z >= 5.5).sort((a, b) => b.z - a.z);
  const noTr = frequent.filter((e) => !e.ru);
  const important = noTr.filter((e) => e.z >= 6.5);
  if (important.length) err(`у самых частых слов нет русского перевода: ${list(important.map((e) => e.w))}`);
  // Обрывки примеров вместо перевода (так было у would): два и больше фрагмента-предложения или один длиннее пяти слов
  const wc = (p) => p.trim().split(/\s+/).length;
  const sentenceLike = (p) => /[.!?]$/.test(p.trim());
  const sentences = frequent.filter((e) => {
    const parts = (e.ru || "").split(/;\s*/);
    return parts.filter((p) => sentenceLike(p) && wc(p) >= 3).length >= 2 || parts.some((p) => sentenceLike(p) && wc(p) >= 6);
  });
  if (sentences.length) err(`в переводе частых слов обрывки предложений: ${list(sentences.map((e) => `${e.w} «${e.ru.slice(0, 40)}»`))}`);
  if (noTr.length > important.length) warn(`у ${noTr.length - important.length} частых слов (z ≥ 5.5) нет русского перевода, только автоперевод: ${list(noTr.filter((e) => !important.includes(e)).map((e) => e.w))}`);

  // ── 3. Поиск слова по форме: контрольные случаи ──────────────────────────────
  const expect = {
    // форма → слово, которое должно открыться
    eyes: "eye", dates: "date", lakes: "lake", hated: "hate", stared: "stare", using: "use", cares: "care", toes: "toe", bees: "bee",
    said: "say", saw: "see", found: "find", felt: "feel", fell: "fall", thought: "think", men: "man", children: "child",
    was: "be", were: "be", is: "be", are: "be", been: "be", had: "have", has: "have", did: "do", done: "do", went: "go", gone: "go",
    "that's": "that", "it's": "it", "can't": "can", "isn't": "be", "didn't": "do", "let's": "let",
    words: "word", times: "time", heads: "head", minutes: "minute", colour: "color", centre: "center",
    left: "left", ground: "ground", people: "people", better: "better",
  };
  const wrong = [];
  for (const [form, want] of Object.entries(expect)) {
    const got = g.lookupWord(form)?.w;
    if (got !== want && g.byId.has(`w:${want}`)) wrong.push(`${form} → ${got ?? "ничего"} (нужно ${want})`);
  }
  if (wrong.length) err(`форма ведёт к чужому слову: ${list(wrong, 12)}`);

  // Контрольные переводы: слово → то, что обязательно должно быть в переводе
  const mustHave = { the: /артикль/, a: /артикль/, an: /артикль/, i: /^я$/, would: /бы/, could: /мог/, do: /делать/, will: /будущ/ };
  const badRu = Object.entries(mustHave).filter(([w, re]) => g.byId.has(`w:${w}`) && !re.test(g.byId.get(`w:${w}`).ru || "")).map(([w]) => w);
  if (badRu.length) err(`у служебных слов испорчен перевод (исправления js/dictfixes.js не сработали): ${list(badRu)}`);

  // Форма из таблицы (is, said, saw…) не должна иметь собственную запись «лучше» начальной формы без причины: смотрим, что вернёт поиск
  const looksLikeThin = words.filter((e) => !e.ru && (e.of || []).some((l) => lemmaCandidates(e.w).includes(l)) && g.lookupWord(e.w) === e);
  if (looksLikeThin.length) warn(`${looksLikeThin.length} форм без перевода остаются при своей записи (у начальной формы нет перевода или она в списке исключений): ${list(looksLikeThin.map((e) => e.w))}`);

  // ── 4. Список «Пополнить словарь» (запасной порядок по частоте из словаря) ─────
  const top = rankFromDictionary(g, SIZE);
  if (words.length >= 10000 && top.length < SIZE) err(`в списке «Пополнить словарь» только ${top.length} слов из ${SIZE}`);
  const topProblems = {
    "не простое слово": top.filter((e) => !isPlainWord(e.w)),
    "без перевода": top.filter((e) => !e.ru && !e.rm),
    "поиск ведёт к другой записи": top.filter((e) => g.lookupWord(e.w) !== e),
  };
  for (const [what, xs] of Object.entries(topProblems)) if (xs.length) err(`в списке «Пополнить словарь» ${xs.length} слов, ${what}: ${list(xs.map((e) => e.w))}`);
  const ids = new Set(top.map((e) => e.id));
  if (ids.size !== top.length) err("в списке «Пополнить словарь» есть повторы");
  const noRuTop = top.filter((e) => !e.ru);
  if (noRuTop.length > top.length * 0.1) warn(`в списке «Пополнить словарь» у ${noRuTop.length} слов только автоперевод (${Math.round((noRuTop.length / top.length) * 100)}%)`);

  // ── 4б. Частотный список data/freq.json (если собран tools/build_freq.py) ─────
  let freqLine = "Файл data/freq.json пуст (заглушка): порядок слов в «Пополнить словарь» берётся из словаря. Чтобы он опирался на частоты в текстах: pip install wordfreq, затем python3 tools/build_freq.py.";
  if (freq != null && !Array.isArray(freq?.words)) {
    err("data/freq.json неправильного вида: нет списка words");
    freqLine = "";
  } else if (freq?.words?.length) {
    const fw = freq.words;
    if (fw.some((x) => typeof x !== "string")) err("в data/freq.json в списке слов не только строки");
    const strs = fw.filter((x) => typeof x === "string");
    const repeats = strs.length - new Set(strs).size;
    if (repeats) err(`в data/freq.json повторяются слова: ${repeats}`);
    // Так же, как в приложении: слово списка ищется как слово из книги (said и say это одна карточка), повторы и неподходящие пропускаются
    const fileTop = buildRanking({ glossary: g, file: { words: strs }, limit: SIZE }).items;
    if (words.length >= 10000 && fileTop.length < SIZE) {
      // Часть слов файла выпадает (формы сходятся с основными словами: said и say одна карточка), нужен запас
      const need = Math.ceil(((strs.length / Math.max(1, fileTop.length)) * SIZE * 1.1) / 100) * 100;
      err(`из data/freq.json получилось только ${fileTop.length} слов из ${SIZE} (из ${strs.length} слов файла часть сходится в одну карточку или без перевода): пересоберите список с запасом, python tools/build_freq.py --size ${need}`);
    }
    const notPlain = fileTop.filter((e) => !isPlainWord(e.w));
    if (notPlain.length) err(`в списке из data/freq.json ${notPlain.length} слов, не простое слово: ${list(notPlain.map((e) => e.w))}`);
    // Форма с собственной записью (founded → found): слово списка ведёт к записи, которая сама по написанию открывает другую. Допустимо.
    const viaForm = fileTop.filter((e) => g.lookupWord(e.w) !== e);
    if (viaForm.length) warn(`в списке из data/freq.json ${viaForm.length} записей, которые по своему написанию открывают другую (в список они попали как форма другого слова): ${list(viaForm.map((e) => e.w))}`);
    const unresolved = (w) => {
      const e = g.lookupWord(w) || g.byId.get(`w:${w}`);
      return !e || !usable(e);
    };
    const lostTop = strs.slice(0, 1000).filter(unresolved);
    if (lostTop.length) warn(`${lostTop.length} слов из первой тысячи data/freq.json не подходят для списка (нет в словаре, нет перевода или служебное слово), они пропускаются: ${list(lostTop)}`);
    const lost = strs.filter(unresolved).length;
    if (lost > strs.length * 0.1) warn(`${lost} из ${strs.length} слов data/freq.json не подходят для списка (нет в словаре, нет перевода, служебные слова) (${Math.round((lost / strs.length) * 100)}%): словарь и список собраны из разных данных?`);
    // Порядок wordfreq и оценка частоты в словаре должны в целом сходиться: если нет, список собран не из тех данных
    const dictFirst = new Set(top.slice(0, 1000).map((e) => e.id));
    const same = fileTop.slice(0, 1000).filter((e) => dictFirst.has(e.id)).length;
    const share = fileTop.length >= 1000 ? Math.round((same / 1000) * 100) : null;
    if (share !== null && share < 55) warn(`первая тысяча data/freq.json совпадает с первой тысячей по частоте из словаря только на ${share}%: проверьте, что список собран из этого словаря`);
    freqLine = `Список из data/freq.json (${freq.src || "источник не указан"}, ${freq.built || "дата не указана"}): в файле ${strs.length} слов, в «Пополнить словарь» войдёт ${fileTop.length}; первая тысяча совпадает с порядком по словарю на ${share ?? "?"}%; не подошло для списка: ${lost}.`;
  }

  // ── 5. Семьи слов и разговорные фразы ───────────────────────────────────────
  const fam = families();
  const thinFam = fam.list.filter((f) => f.members.filter((m) => g.byId.has(`w:${m.w}`)).length < 3);
  if (thinFam.length > fam.list.length * 0.25) warn(`${thinFam.length} из ${fam.list.length} семей слов почти не представлены в словаре (меньше трёх слов): задание «Семья слов» для них недоступно`);
  const phrases = phraseDeck().items;
  const inDict = phrases.filter((p) => g.byId.has(p.id));
  if (phrases.length < 100) err(`в колоде разговорных фраз только ${phrases.length}`);


  const summary = [
    `Словарь: ${g.list.length} записей, ${words.length} слов (разбор в приложении ${ms} мс).`,
    ...(freqLine ? [freqLine] : []),
    `Список «Пополнить словарь»: ${top.length} слов; семей слов: ${fam.list.length} (мало представлены в словаре: ${thinFam.length}); разговорных фраз: ${phrases.length} (уже есть в словаре: ${inDict.length}).`,
  ];
  return { skipped: false, wordCount, errors, warnings, summary };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const path = process.argv[2] || join(root, "data", "dict.json");
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`Не удалось прочитать ${path}: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    console.error(`${path}: ожидался список записей`);
    process.exit(1);
  }
  let freq = null;
  const freqPath = join(dirname(path), "freq.json");
  try {
    freq = JSON.parse(readFileSync(freqPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error(`Не удалось прочитать ${freqPath}: ${e.message}`);
      process.exit(1);
    }
  }
  const r = audit(raw, freq);
  if (r.skipped) {
    console.log(`В ${path} ${r.wordCount} слов: это пробный образец, проверка пропущена.`);
    process.exit(0);
  }
  r.summary.forEach((l) => console.log(l));
  r.warnings.slice(0, 20).forEach((w) => console.log(`  предупреждение: ${w}`));
  r.errors.forEach((e) => console.log(`  ОШИБКА: ${e}`));
  console.log(r.errors.length ? `Найдено ошибок: ${r.errors.length}` : "Ошибок нет.");
  process.exit(r.errors.length ? 1 : 0);
}
