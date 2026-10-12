// leech.js — «трудные слова»: отбор и текст, который можно скопировать и показать Claude, чтобы вместе придумать ассоциации.
// Чистые функции без DOM, проверяются в Node (tests/leech.test.mjs).
import { isLeech } from "./levels.js";

/** Трудные слова: больше всего ошибок первыми. Пропущенные («Это имя») не учитываются. */
export const leeches = (cards) =>
  [...cards]
    .filter((c) => !c.skip && isLeech(c.srs))
    .sort((a, b) => b.srs.lapses - a.srs.lapses || a.srs.lv - b.srs.lv || a.w.localeCompare(b.w));

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

/** Предложение для подсказки: пример из словаря или сохранённое из книги. */
const sampleOf = (c) => c.ex || c.ctx?.[0]?.s || c.found?.[0]?.s || "";

/** Текст для копирования: список трудных слов с переводом, примером и (если есть) вашей ассоциацией. */
export function leechReport(cards) {
  const list = leeches(cards);
  if (!list.length) return "";
  const lines = [
    "Помоги запомнить английские слова, которые мне никак не даются. Для каждого слова предложи короткую ассоциацию на русском (созвучие или яркую картинку), а там, где я уже придумал свою, скажи, как её усилить.",
    "",
  ];
  list.forEach((c, i) => {
    const meaning = c.ru || c.rm || c.en || "";
    lines.push(`${i + 1}. ${c.w}${meaning ? ` — ${meaning}` : ""} (ошибок: ${c.srs.lapses})`);
    const sample = sampleOf(c);
    if (sample) lines.push(`   Пример: ${sample}`);
    if (c.mnemonic) lines.push(`   Моя ассоциация: ${c.mnemonic}`);
  });
  lines.push("", `Всего ${list.length} ${plural(list.length, ["слово", "слова", "слов"])}.`);
  return lines.join("\n");
}
