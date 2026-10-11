// Проверка: словарь, собранный tools/build_dict.py, читается приложением (lex.js) как задумано.
// Запускается из tests/test_build_dict.py:  node tests/dict_compat.mjs путь/к/dict.json
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Glossary, tokenize, findPhrases } from "../js/lex.js";

const g = new Glossary(JSON.parse(readFileSync(process.argv[2], "utf8")));
const phrases = (text) => findPhrases(g, tokenize(text), text).map((m) => m.entry.id);

assert.equal(g.lookupWord("went")?.w, "go");
assert.equal(g.lookupWord("Dogs")?.w, "dog");
assert.equal(g.lookupWord("lit")?.w, "light");
assert.equal(g.lookupWord("left")?.w, "left");
assert.deepEqual(g.lookupWord("left")?.of, ["leave"]);
assert.equal(g.lookupWord("a")?.w, "a");
assert.equal(g.lookupWord("I")?.w, "i");
assert.equal(g.lookupWord("Harry"), null); // имена в словарь не попадают

assert.deepEqual(phrases("She gave it up and kicked the bucket."), ["pv:give up", "id:kick the bucket"]);
assert.deepEqual(phrases("It took her mind off the pain."), ["id:take someone's mind off"]);
assert.deepEqual(phrases("A little bird told me so."), ["id:a (little) bird told me"]);
assert.deepEqual(phrases("A bird told me so."), ["id:a (little) bird told me"]);
assert.deepEqual(phrases("He is a well-known actor."), ["w:well-known"]);
assert.deepEqual(phrases("Come here at once!"), ["id:at once"]);
assert.deepEqual(phrases("Who looks after the dog?"), ["pv:look after"]);
console.log("словарь совместим с приложением");
