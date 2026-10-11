import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sw = readFileSync(join(root, "sw.js"), "utf8");
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
