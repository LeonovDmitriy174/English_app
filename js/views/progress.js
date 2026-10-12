// progress.js — окно «Прогресс»: слова по уровням, повторения за две недели, серия дней. Расчёты: js/progress.js.
// Здесь нет ни времени следующих повторений, ни таймеров: только то, что уже сделано.
import { h, openSheet } from "../dom.js";
import { app } from "../store.js";
import { db } from "../db.js";
import { GROUPS, levelSpread, reviewsByDay, studyDays, streakOf, accuracy, shortDate } from "../progress.js";

const DAYS = 14;

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

export async function openProgress() {
  const body = h("div", { class: "prog" }, h("h2", { class: "set-title" }, "Прогресс"));
  const sheet = openSheet({ content: body, label: "Прогресс", cls: "progress" });
  let log = [];
  try {
    log = await db.all("log");
  } catch {
    /* журнал не открылся: покажем то, что есть без него */
  }
  if (!sheet.el.isConnected) return sheet; // окно закрыли, пока читался журнал

  const spread = levelSpread(app.cards.values());
  if (!spread.total && !log.length) {
    body.append(h("p", { class: "note" }, "Здесь появится ваш прогресс, когда вы добавите слова и начнёте их повторять."));
    return sheet;
  }

  const now = Date.now();
  const rows = reviewsByDay(log, now, DAYS);
  const today = rows[rows.length - 1];
  const run = streakOf(studyDays(log, app.activity), now);
  const acc = accuracy(rows);
  const max = Math.max(1, ...rows.map((r) => r.n));

  body.append(
    h(
      "div",
      { class: "prog-tiles" },
      h("div", null, h("b", null, spread.total), h("span", null, plural(spread.total, ["слово в словаре", "слова в словаре", "слов в словаре"]))),
      h("div", null, h("b", null, spread.mastered), h("span", null, "освоено")),
    ),
    h("p", { class: "sheet-sub" }, "Слова по уровням"),
    h("div", { class: "spread", role: "img", "aria-label": GROUPS.map((g) => `${g.label}: ${spread[g.key]}`).join(", ") }, GROUPS.map((g) => (spread[g.key] ? h("i", { class: `g-${g.key}`, style: { flexGrow: String(spread[g.key]) } }) : null))),
    h("ul", { class: "spread-legend" }, GROUPS.map((g) => h("li", null, h("i", { class: `g-${g.key}` }), g.label, h("b", null, spread[g.key])))),
    h("p", { class: "sheet-sub" }, `Повторения за ${DAYS} дней`),
    h(
      "div",
      { class: "days", role: "img", "aria-label": `Повторений по дням, последний день ${today.n}` },
      rows.map((r, i) => h("div", { class: `day${i === rows.length - 1 ? " now" : ""}`, title: `${shortDate(r.day)}: ${r.n}` }, h("i", { style: { height: `${r.n ? Math.max(6, Math.round((r.n / max) * 100)) : 3}%` } }))),
    ),
    h("div", { class: "days-axis" }, h("span", null, shortDate(rows[0].day)), h("span", null, "сегодня")),
    h(
      "dl",
      { class: "facts" },
      h("dt", null, "Сегодня"),
      h("dd", null, `${today.n} ${plural(today.n, ["повторение", "повторения", "повторений"])}`),
      h("dt", null, "Подряд"),
      h("dd", null, run ? `${run} ${plural(run, ["день", "дня", "дней"])}` : "серия начнётся с первого занятия"),
      acc === null ? null : h("dt", null, `Верно за ${DAYS} дней`),
      acc === null ? null : h("dd", null, `${Math.round(acc * 100)}%`),
    ),
  );
  return sheet;
}
