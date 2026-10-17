import test from "node:test";
import assert from "node:assert/strict";
import { tokenize } from "../js/lex.js";
import { normKey, titleCase, displayName, parseTerms, mergeTerms, normalizeChars, charsToList, mergeChars, exportTerms, matchTerms, keyOfSurface, MAX_WORDS, MAX_TEXT } from "../js/characters.js";

test("ключ: регистр, апострофы, пробелы и знаки", () => {
  assert.equal(normKey("  Night’s   Watch "), "night's watch");
  assert.equal(normKey("Jon Snow!"), "jon snow");
  assert.equal(normKey("King's Landing,"), "king's landing");
  assert.equal(normKey(""), "");
  assert.equal(normKey(null), "");
  assert.equal(titleCase("night's watch"), "Night's Watch");
  assert.equal(titleCase("jon"), "Jon");
  assert.equal(displayName("jon", { n: "Jon Snow", t: "x" }), "Jon Snow");
  assert.equal(displayName("jon", { t: "x" }), "Jon");
  assert.equal(keyOfSurface("Jon’s"), "jon");
  assert.equal(keyOfSurface("Night’s Watch"), "night's watch");
});

test("файл терминов: разделители, кавычки, заголовок, комментарии", () => {
  const text = [
    "term;description",
    "Winterfell;Родовой замок Старков на севере",
    "# комментарий",
    "Jon Snow\tБастард Эддарда Старка, служит в Ночном Дозоре",
    "Night’s Watch|Ночной Дозор: стража у Стены",
    '"Stark, Eddard","Лорд Винтерфелла; Хранитель Севера"',
    "Tyrion, младший сын лорда Тywin",
    "Cersei — королева",
    "без описания;",
    "просто строка",
    "",
  ].join("\n");
  const { items, skipped } = parseTerms(text);
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(by["winterfell"].text, "Родовой замок Старков на севере");
  assert.equal(by["jon snow"].name, "Jon Snow");
  assert.equal(by["night's watch"].text, "Ночной Дозор: стража у Стены");
  assert.equal(by["stark eddard"].text, "Лорд Винтерфелла; Хранитель Севера", "название и описание в кавычках, внутри «;»");
  assert.equal(by["tyrion"].text, "младший сын лорда Тywin", "запятая как разделитель, когда других нет");
  assert.equal(by["cersei"].text, "королева", "тире с пробелами");
  assert.equal(items.length, 6);
  assert.equal(skipped, 2, "строка без описания и строка без разделителя");
  assert.ok(!("term" in by), "заголовок пропущен");
});

test("файл терминов: повторы, ограничения, пустой файл, BOM, строки Windows", () => {
  const { items } = parseTerms("﻿Jon;первое\r\njon;второе\r\n");
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "второе", "побеждает последний");
  assert.deepEqual(parseTerms(""), { items: [], skipped: 0 });
  assert.deepEqual(parseTerms(null), { items: [], skipped: 0 });
  const long = parseTerms(`Zed;${"я".repeat(1000)}`).items[0];
  assert.equal(long.text.length, MAX_TEXT, "длинное описание обрезается");
  const many = parseTerms(`${Array.from({ length: MAX_WORDS + 1 }, (_, i) => "w" + i).join(" ")};длинное название`);
  assert.equal(many.items.length, 0, "термин из шести слов отбрасывается");
  assert.equal(many.skipped, 1);
  // первая строка похожа на заголовок только если это первая строка
  assert.deepEqual(parseTerms("Name;a\nname;b").items.map((i) => i.text), ["b"], "«Name» на первой строке — заголовок, на второй — обычное слово");
});

test("слияние файла с имеющимися: свои записи не затираются", () => {
  const cur = new Map([["jon", { n: "Jon", t: "моё", o: 1 }], ["arya", { n: "Arya", t: "старое" }]]);
  const { items } = parseTerms("Jon;из файла\nArya;новое\nSansa;старшая\nArya;новое");
  const r = mergeTerms(cur, items);
  assert.deepEqual([r.added, r.updated, r.kept], [1, 1, 1]);
  assert.equal(r.map.get("jon").t, "моё", "своя заметка осталась");
  assert.equal(r.map.get("arya").t, "новое");
  assert.equal(r.map.get("sansa").t, "старшая");
  assert.equal(cur.get("arya").t, "старое", "исходная карта не изменилась");
  const again = mergeTerms(r.map, items);
  assert.deepEqual([again.added, again.updated], [0, 0], "повторная загрузка того же файла ничего не меняет");
});

test("хранилище: нормализация, мусор отбрасывается, записи туда и обратно", () => {
  const map = normalizeChars([["Jon", { n: "Jon", t: "бастард", o: 1 }], ["", { t: "x" }], ["bad", { t: "" }], ["arya", { t: "младшая" }], "мусор", null, ["a b c d e f", { t: "шесть слов" }]]);
  assert.deepEqual([...map.keys()], ["jon", "arya"]);
  assert.equal(map.get("jon").o, 1);
  assert.equal(map.get("arya").o, undefined);
  assert.deepEqual(normalizeChars(charsToList(map)), map);
  assert.equal(normalizeChars(undefined).size, 0);
  assert.equal(normalizeChars({}).size, 0);
});

test("слияние копий: чего нет — добавляется, спор решает «своя»", () => {
  const a = new Map([["jon", { n: "Jon", t: "A" }], ["arya", { n: "Arya", t: "A", o: 1 }]]);
  const b = new Map([["jon", { n: "Jon", t: "B", o: 1 }], ["arya", { n: "Arya", t: "B" }], ["sansa", { n: "Sansa", t: "B" }]]);
  const r = mergeChars(a, b);
  assert.equal(r.map.get("jon").t, "B", "в копии заметка своя, на устройстве файловая");
  assert.equal(r.map.get("arya").t, "A", "своя на устройстве остаётся");
  assert.equal(r.map.get("sansa").t, "B");
  assert.equal(r.changed, 2);
});

test("выгрузка читается обратно, названия с «;» и кавычками берутся в кавычки", () => {
  const map = new Map([
    ["jon snow", { n: "Jon Snow", t: "бастард; служит в Дозоре" }],
    ["arya", { n: "", t: 'прозвище "Волчица"' }],
    ["night's watch", { n: "Night's Watch", t: "Ночной Дозор" }],
  ]);
  const text = exportTerms(map);
  assert.equal(text.split("\n")[0].startsWith("Arya;"), true, "по алфавиту, без своего написания — с заглавной");
  const back = parseTerms(text).items;
  assert.equal(back.length, 3);
  assert.equal(back.find((i) => i.key === "jon snow").text, "бастард; служит в Дозоре");
  assert.equal(back.find((i) => i.key === "arya").text, 'прозвище "Волчица"');
});

test("поиск терминов в абзаце: самое длинное совпадение, притяжательная форма, запятая разрывает", () => {
  const map = new Map([["jon", {}], ["jon snow", {}], ["night's watch", {}], ["winterfell", {}], ["wall", {}]]);
  const find = (text) => {
    const toks = tokenize(text);
    return matchTerms(toks, map, text).map((m) => [m.key, m.idxs.map((i) => toks[i].raw).join(" ")]);
  };
  assert.deepEqual(find("Jon Snow rode to Winterfell."), [["jon snow", "Jon Snow"], ["winterfell", "Winterfell"]], "длинный термин вытесняет короткий");
  assert.deepEqual(find("Jon, Snow came."), [["jon", "Jon"]], "через запятую это два разных слова");
  assert.deepEqual(find("Jon's sword and Winterfell’s gates"), [["jon", "Jon's"], ["winterfell", "Winterfell’s"]]);
  assert.deepEqual(find("the Night’s Watch guards the Wall"), [["night's watch", "Night’s Watch"], ["wall", "Wall"]]);
  assert.deepEqual(find("Nothing here."), []);
  assert.deepEqual(matchTerms(tokenize("Jon"), new Map()), [], "пустая карта");
  assert.deepEqual(matchTerms([], map), []);
  // без ptext пробелы не проверяются
  const toks = tokenize("Jon, Snow");
  assert.equal(matchTerms(toks, map)[0].key, "jon snow");
});
