import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeSettings } from "../js/prefs.js";

test("настройки: известные ключи с допустимыми значениями остаются", () => {
  const ok = { theme: "dark", fontSize: 20, newPerDay: 15, reviewsPerDay: 120, hilite: false, speakOnTap: true, slipCompact: false, speedRule: false, mixModes: ["choice"] };
  assert.deepEqual(sanitizeSettings(ok), ok);
});

test("настройки: неверные значения, чужие ключи и не-объекты отбрасываются", () => {
  assert.deepEqual(sanitizeSettings({ theme: "x", fontSize: "abc", newPerDay: -1, reviewsPerDay: 1e9, hilite: "yes", mixModes: "all", extra: 1 }), {});
  assert.deepEqual(sanitizeSettings({ fontSize: 99999 }), {});
  assert.deepEqual(sanitizeSettings({ fontSize: NaN }), {});
  for (const junk of [undefined, null, 0, "abc", [], [1, 2], true]) assert.deepEqual(sanitizeSettings(junk), {});
});

test("настройки: ключ __proto__ и constructor из файла копии ничего не меняют", () => {
  const evil = JSON.parse('{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"polluted": 2}}, "theme": "light"}');
  const out = sanitizeSettings(evil);
  assert.deepEqual(out, { theme: "light" });
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal({}.polluted, undefined);
  const target = { theme: "auto" };
  Object.assign(target, out);
  assert.equal(Object.getPrototypeOf(target), Object.prototype);
});
