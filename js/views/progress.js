// progress.js — вкладка «Прогресс» (адрес #/progress): кривая «Выучено слов», календарь занятий, слова по уровням, повторения и чтение за две недели, серия дней.
// Расчёты: js/progress.js и js/charts.js, рисунки: js/views/charts.js.
// Здесь нет ни времени следующих повторений, ни таймеров: только то, что уже сделано.
import { h } from "../dom.js";
import { app } from "../store.js";
import { db } from "../db.js";
import { cleanLog } from "../records.js";
import { GROUPS, levelSpread, reviewsByDay, studyDays, streakOf, accuracy } from "../progress.js";
import { activityGrid, learnedSeries, readByDay, plural, HEAT_WEEKS } from "../charts.js";
import { heatmap, learnedCurve, daysChart } from "./charts.js";

const DAYS = 14;

export function renderProgress(root) {
  const body = h("div", { class: "prog" });
  root.replaceChildren(h("main", { class: "view" }, h("div", { class: "page" }, h("header", { class: "top" }, h("div", null, h("h1", { class: "title" }, "Прогресс"))), body)));
  let alive = true;
  paint();
  return () => {
    alive = false;
  };

  async function paint() {
    let log = [];
    try {
      log = cleanLog(await db.all("log"));
    } catch {
      /* журнал не открылся: покажем то, что есть без него */
    }
    if (!alive) return; // вкладку закрыли, пока читался журнал
    fill(body, log);
  }
}

function fill(body, log) {
  const spread = levelSpread(app.cards.values());
  if (!spread.total && !log.length && !Object.keys(app.activity.read).length) {
    body.append(h("p", { class: "note" }, "Здесь появится ваш прогресс, когда вы добавите слова и начнёте их повторять."));
    return;
  }

  const now = Date.now();
  const rows = reviewsByDay(log, now, DAYS);
  const today = rows[rows.length - 1];
  const run = streakOf(studyDays(log, app.activity), now);
  const acc = accuracy(rows);
  const cards = [...app.cards.values()];
  const curve = learnedSeries(cards, log, now);

  body.append(
    h(
      "div",
      { class: "prog-tiles" },
      h("div", null, h("b", null, spread.total), h("span", null, plural(spread.total, ["слово в словаре", "слова в словаре", "слов в словаре"]))),
      h("div", null, h("b", null, spread.mastered), h("span", null, "освоено")),
    ),
    h("p", { class: "sheet-sub" }, "Выучено слов"),
    curve ? learnedCurve(curve) : h("p", { class: "note" }, "Кривая появится, когда первое слово дойдёт до уровня «Знаю»."),
    h("p", { class: "sheet-sub" }, `Занятия за ${HEAT_WEEKS} недель`),
    heatmap(activityGrid(log, app.activity, now)),
    h("p", { class: "sheet-sub" }, "Слова по уровням"),
    h("div", { class: "spread", role: "img", "aria-label": GROUPS.map((g) => `${g.label}: ${spread[g.key]}`).join(", ") }, GROUPS.map((g) => (spread[g.key] ? h("i", { class: `g-${g.key}`, style: { flexGrow: String(spread[g.key]) } }) : null))),
    h("ul", { class: "spread-legend" }, GROUPS.map((g) => h("li", null, h("i", { class: `g-${g.key}` }), g.label, h("b", null, spread[g.key])))),
    h("p", { class: "sheet-sub" }, `За ${DAYS} дней`),
    daysChart(rows, readByDay(app.activity, now, DAYS)),
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
}
