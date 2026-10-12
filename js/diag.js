// diag.js — журнал неожиданных ошибок и «сведения для отладки». Чистые функции без DOM (tests/diag.test.mjs).
//
// Без журнала ошибки на телефоне исчезают бесследно: открыть консоль на iPhone нельзя. Здесь они складываются в небольшой список
// (в localStorage, не больше 20 штук), а в настройках одна кнопка копирует версию, состояние данных и этот список.
// Тексты книг и слов в журнал не попадают: только сообщение об ошибке и место в коде.

const KEY = "ember.errors";
const MAX = 20;
const NOISE = /ResizeObserver loop|^Script error\.?$/i; // безобидные сообщения браузера

/** Журнал ошибок. storage — как localStorage (getItem/setItem); если он недоступен, журнал живёт только до закрытия приложения. */
export function createErrorLog(storage = globalThis.localStorage, now = () => Date.now()) {
  let list = [];
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "[]");
    if (Array.isArray(saved)) list = saved.filter((e) => e && typeof e.msg === "string").slice(-MAX);
  } catch {
    /* запись испорчена или нет доступа: начинаем с пустого журнала */
  }
  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify(list));
    } catch {
      /* журнал не критичен */
    }
  };
  return {
    /** Добавляет запись. Подряд идущие одинаковые сливаются в одну со счётчиком. */
    add(kind, message, where = "") {
      const msg = String(message || "").replace(/\s+/g, " ").trim().slice(0, 240);
      if (!msg || NOISE.test(msg)) return false;
      const last = list[list.length - 1];
      if (last && last.kind === kind && last.msg === msg && last.where === where) {
        last.n = (last.n || 1) + 1;
        last.t = now();
      } else {
        list.push({ t: now(), kind, msg, where, n: 1 });
        if (list.length > MAX) list = list.slice(-MAX);
      }
      save();
      return true;
    },
    list: () => [...list],
    count: () => list.length,
    clear() {
      list = [];
      save();
    },
  };
}

/** Короткое описание места в коде: «js/views/reader.js:120». */
export function whereOf(source, line) {
  if (!source) return "";
  const path = String(source).replace(/^[a-z]+:\/\/[^/]+\//i, "").split("?")[0];
  return line ? `${path}:${line}` : path;
}

/** Сообщение из причины необработанного отказа (Promise): ошибка, строка или что угодно. */
export function reasonText(reason) {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

const pad = (n) => String(n).padStart(2, "0");
const stamp = (t) => {
  const d = new Date(t);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtBytes = (n) => {
  if (!Number.isFinite(n)) return "?";
  if (n >= 2 ** 30) return `${(n / 2 ** 30).toFixed(1)} ГБ`;
  if (n >= 2 ** 20) return `${(n / 2 ** 20).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(n / 1024))} КБ`;
};

/**
 * Текст «сведений для отладки». Его можно отправить разработчику: версия, состояние данных, ошибки.
 * info: { name, version, build, now, screen, standalone, userAgent, storage: { usage, quota, persisted },
 *         counts: { cards, notes, books, log }, dict: { state, entries, ms, error }, backupAt, offline, errors }
 */
export function buildReport(info) {
  const { name = "", version = "", build = "", now = Date.now(), counts = {}, dict = {}, storage = {}, errors = [] } = info;
  const lines = [`${name} ${version} · сборка ${build}`, `Время: ${stamp(now)}`];
  if (info.screen) lines.push(`Экран: ${info.screen}, ${info.standalone ? "приложение на экране «Домой»" : "вкладка браузера"}`);
  if (info.userAgent) lines.push(`Браузер: ${info.userAgent}`);
  if (Number.isFinite(storage.usage)) lines.push(`Хранилище: ${fmtBytes(storage.usage)} из ${fmtBytes(storage.quota)}, постоянное: ${storage.persisted ? "да" : "нет"}`);
  lines.push(`Данные: карточек ${counts.cards ?? "?"}, заметок ${counts.notes ?? "?"}, книг ${counts.books ?? "?"}, записей журнала ${counts.log ?? "?"}`);
  const dictLine = { ready: `загружен, записей ${dict.entries}, ${dict.ms} мс`, loading: "ещё загружается", error: `НЕ ЗАГРУЖЕН: ${dict.error || "причина неизвестна"}` }[dict.state] || "неизвестно";
  lines.push(`Словарь: ${dictLine}`);
  lines.push(`Последняя копия данных: ${info.backupAt ? stamp(info.backupAt) : "не было"}`);
  if (info.offline != null) lines.push(`Офлайн-кэш: ${info.offline ? "работает" : "не включён"}`);
  lines.push(errors.length ? `Ошибки (${errors.length}):` : "Ошибок не было");
  for (const e of errors) lines.push(`  ${stamp(e.t)} ${e.kind}${e.n > 1 ? ` ×${e.n}` : ""}: ${e.msg}${e.where ? ` (${e.where})` : ""}`);
  return lines.join("\n");
}

/** Общий журнал приложения. */
export const errorLog = createErrorLog();

/** Подключает перехват ошибок окна. Возвращает функцию отключения (нужна тестам). */
export function installErrorLog(target = globalThis.window, log = errorLog) {
  if (!target?.addEventListener) return () => {};
  const onError = (e) => log.add("ошибка", e.message || reasonText(e.error), whereOf(e.filename, e.lineno));
  const onReject = (e) => log.add("отказ", reasonText(e.reason));
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onReject);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onReject);
  };
}
