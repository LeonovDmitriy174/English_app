// prefs.js — настройки из хранилища или из файла копии: берутся только известные ключи и только допустимые значения.
// Чистые функции без DOM (tests/prefs.test.mjs). Без этого неверный файл мог бы записать в настройки что угодно
// (размер текста «abc», тему «x», чужие ключи) и сломать вид приложения.
import { CAP_MIN, CAP_MAX } from "./pacing.js";

const THEMES = ["auto", "light", "dark"];
// Допустимые значения тех же настроек, что даёт интерфейс (js/views/settings.js, dictsettings.js)
const RULES = {
  theme: (v) => THEMES.includes(v),
  fontSize: (v) => Number.isFinite(v) && v >= 15 && v <= 28,
  newPerDay: (v) => Number.isFinite(v) && v >= 0 && v <= 200,
  reviewsPerDay: (v) => Number.isFinite(v) && v >= CAP_MIN && v <= CAP_MAX,
  hilite: (v) => typeof v === "boolean",
  speakOnTap: (v) => typeof v === "boolean",
  slipCompact: (v) => typeof v === "boolean",
  speedRule: (v) => typeof v === "boolean",
  mixModes: (v) => Array.isArray(v), // состав проверяет normalizeMix (js/modes.js)
};

/** Из присланных настроек остаются известные ключи с допустимыми значениями; всё прочее отбрасывается. */
export function sanitizeSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, ok] of Object.entries(RULES)) {
    if (Object.hasOwn(raw, key) && ok(raw[key])) out[key] = raw[key];
  }
  return out;
}
