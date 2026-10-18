// Проверка словаря (tools/audit_dict.mjs): чистый словарь проходит, словарь с дефектами нет.
import test from "node:test";
import assert from "node:assert/strict";
import { audit } from "../tools/audit_dict.mjs";

// Достаточно много «слов», чтобы проверка не приняла словарь за пробный образец (меньше 2000 слов пропускается)
const letter = (n) => String.fromCharCode(97 + n);
const filler = () =>
  Array.from({ length: 2100 }, (_, i) => ({ t: "w", w: `q${letter(i % 26)}${letter(Math.floor(i / 26) % 26)}${letter(Math.floor(i / 676))}`, pos: "noun", ru: "слово", en: "a word", z: 4 }));

test("образец меньше 2000 слов пропускается", () => {
  const r = audit([{ t: "w", w: "cat", ru: "кот", en: "cat", z: 5 }]);
  assert.equal(r.skipped, true);
  assert.deepEqual(r.errors, []);
});

test("чистый словарь без ошибок", () => {
  const r = audit(filler());
  assert.equal(r.skipped, false);
  assert.deepEqual(r.errors, []);
});

test("словарь с дефектами: каждый находится", () => {
  const bad = [
    ...filler(),
    { t: "w", w: "dupe", ru: "раз", en: "x", z: 4 },
    { t: "w", w: "dupe", ru: "два", en: "x", z: 4 },
    { t: "w", w: "tagged", pos: "noun", ru: "{{label|en|x}} слово", en: "x", z: 4 },
    { t: "w", w: "woulda", pos: "verb", ru: "если бы ты не открыл окно!; опоздает ли автобус.; что скоро вернется.", en: "x", z: 6.3 },
    { t: "w", w: "freq", pos: "noun", rm: "только автоперевод", en: "very common", z: 7 },
    // у начальной формы нет русского перевода, поэтому said остаётся при своей записи — а надо, чтобы вёл к say
    { t: "w", w: "say", pos: "verb", rm: "говорить", en: "to speak", z: 6 },
    { t: "w", w: "said", pos: "adjective", ru: "упомянутый", en: "aforesaid", of: ["say"], z: 6 },
    { t: "w", w: "x-bad", of: "not-a-list", ru: "ик", en: "x", z: 3 },
    { t: "zz", w: "unknown-type" },
  ];
  const text = audit(bad).errors.join("\n");
  assert.match(text, /повторяются записи: w:dupe/);
  assert.match(text, /обломки разметки: tagged/);
  assert.match(text, /обрывки предложений: woulda/);
  assert.match(text, /нет русского перевода: freq/);
  assert.match(text, /said → said \(нужно say\)/);
  assert.match(text, /неправильного вида/);
});

test("HTML-сущности в переводах не ошибка: приложение заменяет их при загрузке", () => {
  const r = audit([...filler(), { t: "w", w: "askedx", pos: "verb", rm: "&lt; &lt; Арсед &gt; &gt;", en: "x", z: 4 }]);
  assert.deepEqual(r.errors, []);
});

test("частотный список data/freq.json: заглушка не ошибка, повторы, составные слова и мусор находятся", () => {
  const dict = [...filler(), { t: "w", w: "is-a", pos: "noun", ru: "это", en: "x", z: 5.4 }, { t: "w", w: "rareaa", pos: "noun", ru: "редкое", en: "x", z: 3.6 }];
  const ws = filler().map((e) => e.w);
  const stub = audit(dict, { v: 1, src: "none", built: "", size: 0, words: [] });
  assert.deepEqual(stub.errors, []);
  assert.match(stub.summary.join("\n"), /заглушка/);
  assert.match(audit(dict).summary.join("\n"), /заглушка/, "без файла то же, что заглушка");

  const good = audit(dict, { v: 1, src: "nation-bnc-coca", built: "2026-10-18", words: ws.slice(0, 500) });
  assert.deepEqual(good.errors, []);
  assert.match(good.summary.join("\n"), /nation-bnc-coca, 2026-10-18\): в файле 500 слов, в «Топ слов по частотности» войдёт 500/);

  const bad = audit(dict, { words: [...ws.slice(0, 50), ws[3], "is-a"] }).errors.join("\n");
  assert.match(bad, /data\/freq\.json повторяются слова: 1/);
  assert.match(bad, /не простое слово: is-a/);
  assert.match(audit(dict, { words: "x" }).errors.join("\n"), /неправильного вида/);
  assert.match(audit(dict, { words: [...ws.slice(0, 20), 5] }).errors.join("\n"), /не только строки/);

  const lost = audit(dict, { words: ["nosuchwordx", "be", ...ws.slice(0, 30)] });
  assert.deepEqual(lost.errors, []);
  assert.match(lost.warnings.join("\n"), /не подходят для списка.*nosuchwordx, be/);

  // порядок списка Нейшна не сверяется с частотой основного слова в словаре: у семьи может быть частым не оно само (govern, relate)
  const rare = audit(dict, { words: ["rareaa", ...ws.slice(0, 400)] });
  assert.deepEqual(rare.errors, []);
  assert.deepEqual(rare.warnings.filter((x) => /редкие/.test(x)), []);
});

test("data/freq.json даёт меньше десяти тысяч слов: ошибка с подсказкой, сколько списков взять", () => {
  const big = Array.from({ length: 12500 }, (_, i) => ({ t: "w", w: `q${letter(i % 26)}${letter(Math.floor(i / 26) % 26)}${letter(Math.floor(i / 676) % 26)}${letter(Math.floor(i / 17576))}`, pos: "noun", ru: "слово", en: "a word", z: 4 }));
  const r = audit(big, { v: 1, src: "nation-bnc-coca", built: "2026-10-18", words: big.slice(0, 8000).map((e) => e.w) });
  assert.match(r.errors.join("\n"), /получилось только 8000 слов из 10000.*--lists 11/);
  const ok = audit(big, { v: 1, src: "nation-bnc-coca", built: "2026-10-18", words: big.slice(0, 11500).map((e) => e.w) });
  assert.deepEqual(ok.errors, []);
});
