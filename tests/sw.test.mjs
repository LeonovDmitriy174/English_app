import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sw = readFileSync(join(root, "sw.js"), "utf8");
const workflow = readFileSync(join(root, ".github/workflows/pages.yml"), "utf8");
const listed = [...sw.slice(sw.indexOf("const FILES"), sw.indexOf("];", sw.indexOf("const FILES"))).matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name).split("\\").join("/")]));

test("офлайн-кэш: каждый файл из списка существует", () => {
  assert.ok(listed.length > 20);
  for (const f of listed) assert.ok(f === "./" || existsSync(join(root, f)), `${f} указан в sw.js, но файла нет`);
});

test("офлайн-кэш: все файлы js/ и css/ перечислены в sw.js", () => {
  for (const f of [...walk("js"), ...walk("css")]) assert.ok(listed.includes(f), `${f} не добавлен в FILES в sw.js: офлайн он не заработает`);
});

test("офлайн-кэш: встроенные книги (books/) не кэшируются приложением", () => {
  assert.ok(!listed.some((f) => f.startsWith("books/")));
  assert.match(sw, /startsWith\(new URL\("books\/"/);
});

test("все модули, которые импортируют друг друга, лежат в списке и импортируются по существующим путям", () => {
  for (const f of walk("js")) {
    const src = readFileSync(join(root, f), "utf8");
    for (const m of src.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
      const target = join(dirname(f), m[1]).split("\\").join("/");
      assert.ok(existsSync(join(root, target)), `${f}: импорт ${m[1]} ведёт в несуществующий файл`);
      assert.ok(listed.includes(target), `${f}: импортирует ${target}, а его нет в sw.js`);
    }
  }
});

test("словарь лежит в своём кэше, а не в общем списке файлов приложения", () => {
  assert.ok(!listed.includes("data/dict.json"), "словарь в FILES: каждое обновление скачивало бы его заново");
  assert.match(sw, /const DICT_FILE = "data\/dict\.json"/);
  assert.ok(existsSync(join(root, "data/dict.json")));
  assert.match(sw, /const DICT_CACHE = `ember-dict-\$\{DEV \? "dev" : DICT\}`/);
  // при активации прошлые кэши удаляются, но кэш текущего словаря остаётся
  assert.match(sw, /k !== CACHE && k !== DICT_CACHE/);
  // словарь скачивается только если его ещё нет в кэше (в режиме разработки заново)
  assert.match(sw, /needDict = DEV \|\| !\(await dicts\.match\(DICT_FILE\)\)/);
});

test("публикация: тесты идут до выкладки, номер сборки и отпечаток словаря подставляются в нужные файлы", () => {
  assert.match(workflow, /deploy:\s*\n\s*needs: test/, "deploy должен ждать job test");
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /node --check/);
  assert.match(workflow, /unittest tests\/test_build_dict\.py/);
  assert.match(workflow, /sed -i "s\/__BUILD__\/\$\{GITHUB_SHA::7\}\/" _site\/sw\.js _site\/js\/build\.js/);
  assert.match(workflow, /sed -i "s\/__DICT__\/\$\{DICT\}\/" _site\/sw\.js/);
  assert.match(workflow, /sha256sum _site\/data\/dict\.json/);
  // маркеры, которые подставляет workflow, на самом деле есть в файлах
  assert.match(sw, /const BUILD = "__BUILD__"/);
  assert.match(sw, /const DICT = "__DICT__"/);
  assert.match(readFileSync(join(root, "js/build.js"), "utf8"), /export const BUILD = "__BUILD__"/);
});

test("тесты не зависят от настоящего словаря: он меняется, а тесты читают свой маленький образец", () => {
  for (const f of readdirSync(join(root, "tests")).filter((n) => n.endsWith(".test.mjs"))) {
    const src = readFileSync(join(root, "tests", f), "utf8");
    assert.ok(!/\.\.\/data\/dict\.json/.test(src), `${f} читает data/dict.json: после замены словаря тесты, а с ними и публикация, сломаются`);
  }
});
