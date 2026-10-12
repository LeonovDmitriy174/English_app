import test from "node:test";
import assert from "node:assert/strict";
import { createErrorLog, whereOf, reasonText, buildReport, fmtBytes, installErrorLog } from "../js/diag.js";

const memory = (initial) => {
  const m = new Map(initial ? [["ember.errors", initial]] : []);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), raw: () => m.get("ember.errors") };
};

test("журнал ошибок: запись, подсчёт и сохранение", () => {
  const st = memory();
  let t = 1000;
  const log = createErrorLog(st, () => t++);
  assert.equal(log.count(), 0);
  assert.equal(log.add("ошибка", "Cannot read properties of null", "js/views/reader.js:120"), true);
  assert.equal(log.count(), 1);
  assert.deepEqual(JSON.parse(st.raw())[0].where, "js/views/reader.js:120");
  // после «перезапуска» журнал читается из хранилища
  assert.equal(createErrorLog(st).count(), 1);
});

test("журнал ошибок: подряд идущие одинаковые сливаются со счётчиком", () => {
  const log = createErrorLog(memory());
  for (let i = 0; i < 5; i++) log.add("отказ", "QuotaExceededError");
  assert.equal(log.count(), 1);
  assert.equal(log.list()[0].n, 5);
  log.add("отказ", "другая ошибка");
  log.add("отказ", "QuotaExceededError");
  assert.equal(log.count(), 3);
});

test("журнал ошибок: хранится не больше 20 записей, самые старые уходят", () => {
  const log = createErrorLog(memory());
  for (let i = 0; i < 30; i++) log.add("ошибка", `ошибка ${i}`);
  assert.equal(log.count(), 20);
  assert.equal(log.list()[0].msg, "ошибка 10");
  assert.equal(log.list()[19].msg, "ошибка 29");
});

test("журнал ошибок: шум браузера и пустые сообщения не записываются", () => {
  const log = createErrorLog(memory());
  assert.equal(log.add("ошибка", "ResizeObserver loop completed with undelivered notifications."), false);
  assert.equal(log.add("ошибка", "Script error."), false);
  assert.equal(log.add("ошибка", "   "), false);
  assert.equal(log.add("ошибка", ""), false);
  assert.equal(log.count(), 0);
});

test("журнал ошибок: длинное сообщение обрезается, переносы строк убираются", () => {
  const log = createErrorLog(memory());
  log.add("ошибка", "строка 1\n   строка 2 " + "я".repeat(500));
  const msg = log.list()[0].msg;
  assert.ok(msg.length <= 240);
  assert.ok(!msg.includes("\n"));
});

test("журнал ошибок: без доступа к хранилищу или с испорченной записью работает в памяти", () => {
  const log = createErrorLog(null);
  log.add("ошибка", "раз");
  assert.equal(log.count(), 1);
  assert.equal(createErrorLog(memory("{не json")).count(), 0);
  assert.equal(createErrorLog(memory('{"a":1}')).count(), 0);
  const broken = { getItem: () => "[]", setItem: () => { throw new Error("quota"); } };
  const log2 = createErrorLog(broken);
  assert.doesNotThrow(() => log2.add("ошибка", "запись не удалась"));
  assert.equal(log2.count(), 1);
});

test("журнал ошибок: clear очищает и хранилище", () => {
  const st = memory();
  const log = createErrorLog(st);
  log.add("ошибка", "раз");
  log.clear();
  assert.equal(log.count(), 0);
  assert.equal(createErrorLog(st).count(), 0);
});

test("место ошибки: путь без адреса сайта и без параметров", () => {
  assert.equal(whereOf("https://leonovdmitriy174.github.io/English_app/js/views/reader.js?v=3", 120), "English_app/js/views/reader.js:120");
  assert.equal(whereOf("http://127.0.0.1:8080/js/store.js", 7), "js/store.js:7");
  assert.equal(whereOf("", 5), "");
  assert.equal(whereOf("http://127.0.0.1:8080/js/store.js"), "js/store.js");
});

test("причина отказа: ошибка, строка и произвольное значение", () => {
  assert.equal(reasonText(new Error("упало")), "упало");
  assert.equal(reasonText("просто текст"), "просто текст");
  assert.equal(reasonText({ code: 3 }), '{"code":3}');
  assert.equal(reasonText(undefined), "undefined");
});

test("размеры в человеческом виде", () => {
  assert.equal(fmtBytes(512), "1 КБ");
  assert.equal(fmtBytes(5 * 2 ** 20), "5.0 МБ");
  assert.equal(fmtBytes(1.5 * 2 ** 30), "1.5 ГБ");
  assert.equal(fmtBytes(NaN), "?");
});

const base = {
  name: "Ember Chronicle",
  version: "3.7",
  build: "a1b2c3d",
  now: new Date(2026, 9, 12, 12, 30).getTime(),
  screen: "390×844",
  standalone: true,
  userAgent: "iPhone iOS 18",
  storage: { usage: 12 * 2 ** 20, quota: 2 ** 30, persisted: true },
  counts: { cards: 120, notes: 14, books: 3, log: 540 },
  dict: { state: "ready", entries: 61678, ms: 480 },
  backupAt: new Date(2026, 9, 7, 9, 0).getTime(),
  offline: true,
  errors: [],
};

test("сведения для отладки: основные строки", () => {
  const text = buildReport(base);
  assert.match(text, /^Ember Chronicle 3\.7 · сборка a1b2c3d/);
  assert.match(text, /Время: 12\.10 12:30/);
  assert.match(text, /приложение на экране «Домой»/);
  assert.match(text, /Хранилище: 12\.0 МБ из 1\.0 ГБ, постоянное: да/);
  assert.match(text, /карточек 120, заметок 14, книг 3, записей журнала 540/);
  assert.match(text, /Словарь: загружен, записей 61678, 480 мс/);
  assert.match(text, /Последняя копия данных: 07\.10 09:00/);
  assert.match(text, /Офлайн-кэш: работает/);
  assert.match(text, /Ошибок не было/);
});

test("сведения для отладки: ошибки, сбой словаря и отсутствие копий видны сразу", () => {
  const text = buildReport({
    ...base,
    standalone: false,
    backupAt: null,
    offline: false,
    dict: { state: "error", error: "data/dict.json: 404" },
    errors: [
      { t: base.now, kind: "ошибка", msg: "Cannot read properties of null", where: "js/views/reader.js:120", n: 3 },
      { t: base.now, kind: "отказ", msg: "QuotaExceededError", where: "", n: 1 },
    ],
  });
  assert.match(text, /вкладка браузера/);
  assert.match(text, /Словарь: НЕ ЗАГРУЖЕН: data\/dict\.json: 404/);
  assert.match(text, /Последняя копия данных: не было/);
  assert.match(text, /Офлайн-кэш: не включён/);
  assert.match(text, /Ошибки \(2\):/);
  assert.match(text, /ошибка ×3: Cannot read properties of null \(js\/views\/reader\.js:120\)/);
  assert.match(text, /отказ: QuotaExceededError$/m);
});

test("сведения для отладки: без данных о хранилище и экране строки не выдумываются", () => {
  const text = buildReport({ name: "Ember", version: "3.7", build: "dev", counts: {}, dict: { state: "loading" } });
  assert.ok(!/Хранилище:/.test(text));
  assert.ok(!/Экран:/.test(text));
  assert.match(text, /Словарь: ещё загружается/);
});

test("перехват ошибок окна пишет в журнал и отключается", () => {
  const handlers = new Map();
  const target = {
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type) => handlers.delete(type),
  };
  const log = createErrorLog(memory());
  const off = installErrorLog(target, log);
  handlers.get("error")({ message: "Uncaught TypeError: x is not a function", filename: "http://h/js/app.js", lineno: 9 });
  handlers.get("unhandledrejection")({ reason: new Error("отказ промиса") });
  assert.equal(log.count(), 2);
  assert.equal(log.list()[0].where, "js/app.js:9");
  assert.equal(log.list()[1].msg, "отказ промиса");
  off();
  assert.equal(handlers.size, 0);
});
