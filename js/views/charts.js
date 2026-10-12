// views/charts.js — рисунки для окна «Прогресс», главной и меню книги: календарь занятий, кривая «Выучено слов», столбики по дням,
// маленький график и полоска книги. Расчёты лежат в js/charts.js; здесь только разметка.
//
// Рисуем встроенным SVG без библиотек. Всё, что попадает в разметку, — числа и подписи из нашего же кода (названия месяцев, даты),
// пользовательского текста внутри рисунков нет. У каждого графика есть подпись под ним: по касанию или ведению пальцем (на компьютере — по наведению
// и стрелкам) она показывает день или точку. Значения не прячем в подсказках title: на iPhone их не видно.
import { h } from "../dom.js";
import { fmtDuration } from "../activity.js";
import { bookMap, paceLine, readingPace, finishEstimate, linePath, nearestPoint, describeDay, describePoint, fmtDayShort, fmtDayLong, plural } from "../charts.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const f1 = (x) => Math.round(x * 10) / 10;

/**
 * Делает область «выбираемой»: касание и ведение пальцем по ней (мышью — наведение), стрелки на клавиатуре.
 * locate(fx, fy) по положению внутри области (доли 0…1) возвращает номер выбранного места; pick(номер) его показывает; move(dx, dy) — шаг стрелкой.
 */
function pickable(el, { locate, pick, move }) {
  let down = false;
  const at = (e) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) pick(locate((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
  };
  const end = () => {
    down = false;
  };
  el.addEventListener("pointerdown", (e) => {
    down = true;
    at(e);
  });
  el.addEventListener("pointermove", (e) => {
    if (down || e.pointerType === "mouse") at(e);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(type, end);
  el.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    move(step[0], step[1]);
  });
}

/** Область графика, к которой можно прикоснуться: фокусируется с клавиатуры и называется для экранных читалок. */
const area = (label, html, extra = "") => h("div", { class: `chart pick${extra}`, role: "group", tabindex: "0", "aria-label": label, html });

// ── Календарь занятий ───────────────────────────────────────────────────────
const HEAT_W = 340;
const HEAT_GUT = 24; // слева подписи дней недели
const HEAT_TOP = 16; // сверху подписи месяцев
const HEAT_GAP = 3;

/** grid — результат activityGrid(). Возвращает блок «рисунок + подпись». */
export function heatmap(grid) {
  const size = (HEAT_W - HEAT_GUT - (grid.weeks - 1) * HEAT_GAP) / grid.weeks;
  const step = size + HEAT_GAP;
  const H = HEAT_TOP + 7 * step - HEAT_GAP + 2;
  const last = grid.cells.length - 1;
  const rects = grid.cells.map((c, i) => `<rect class="hm l${c.level}${i === last ? " now" : ""}" x="${f1(HEAT_GUT + c.col * step)}" y="${f1(HEAT_TOP + c.row * step)}" width="${f1(size)}" height="${f1(size)}" rx="3.5"/>`).join("");
  const months = grid.months.map((m) => `<text class="ax" x="${f1(HEAT_GUT + m.col * step)}" y="11">${m.label}</text>`).join("");
  const days = [["Пн", 0], ["Ср", 2], ["Пт", 4]].map(([t, r]) => `<text class="ax" x="0" y="${f1(HEAT_TOP + r * step + size * 0.78)}">${t}</text>`).join("");
  const box = area(`Календарь занятий за ${grid.weeks} недель`, `<svg viewBox="0 0 ${HEAT_W} ${f1(H)}" focusable="false" aria-hidden="true">${months}${days}${rects}</svg>`);
  const cap = h("p", { class: "chart-cap", "aria-live": "polite" });
  const base = `Дней с занятиями: ${grid.activeDays} из ${grid.cells.length}`;
  cap.textContent = base;
  const cells = box.querySelectorAll("rect.hm");
  let sel = -1;
  const pick = (i) => {
    if (i === sel) return;
    cells[sel]?.classList.remove("sel");
    sel = i;
    cells[i].classList.add("sel");
    cap.textContent = describeDay(grid.cells[i]);
  };
  pickable(box, {
    locate: (fx, fy) => {
      const col = clamp(Math.floor((fx * HEAT_W - HEAT_GUT) / step), 0, grid.weeks - 1);
      const row = clamp(Math.floor((fy * H - HEAT_TOP) / step), 0, 6);
      return Math.min(last, col * 7 + row);
    },
    pick,
    move: (dx, dy) => pick(clamp((sel < 0 ? last : sel) + dx * 7 + dy, 0, last)),
  });
  return h("div", null, box, cap);
}

// ── Кривая «Выучено слов» ───────────────────────────────────────────────────
const CV = { w: 340, h: 150, x0: 40, x1: 332, y0: 10, y1: 118 };

/**
 * series — результат learnedSeries(). Шкала по вертикали подбирается по данным и растёт вместе со словарём: ни цели, ни верхней черты нет,
 * линии делений идут только до последнего деления, а выше линия свободна.
 */
export function learnedCurve(series) {
  const pts = series.points;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const X = (t) => CV.x0 + ((t - t0) / (t1 - t0)) * (CV.x1 - CV.x0);
  const Y = (n) => CV.y1 - (n / series.max) * (CV.y1 - CV.y0);
  const xy = pts.map((p) => ({ x: X(p.t), y: Y(p.n) }));
  let grid = "";
  for (let v = 0; v < series.max; v += series.step) {
    const y = f1(Y(v));
    grid += `<line class="${v ? "cv-grid" : "cv-base"}" x1="${CV.x0}" x2="${CV.x1}" y1="${y}" y2="${y}"/><text class="ax" x="${CV.x0 - 8}" y="${f1(Y(v) + 4)}" text-anchor="end">${v.toLocaleString("ru-RU")}</text>`;
  }
  const end = xy[xy.length - 1];
  const svg =
    `<svg viewBox="0 0 ${CV.w} ${CV.h}" focusable="false" aria-hidden="true">${grid}` +
    `<path class="cv-line" pathLength="1" d="${linePath(xy)}"/>` +
    `<g class="cv-mark"><line y1="${CV.y0}" y2="${CV.y1}"/><circle r="5"/></g>` +
    `<circle class="cv-dot" cx="${f1(end.x)}" cy="${f1(end.y)}" r="4"/>` +
    `<text class="ax" x="${CV.x0}" y="${CV.h - 8}">${fmtDayShort(pts[0].day)}</text><text class="ax" x="${CV.x1}" y="${CV.h - 8}" text-anchor="end">сегодня</text></svg>`;
  const box = area(`Выучено слов по дням. Сейчас ${series.total}.`, svg);
  const cap = h("p", { class: "chart-cap", "aria-live": "polite" });
  const base = `Сейчас: ${series.total} ${plural(series.total, ["слово", "слова", "слов"])}`;
  cap.textContent = base;
  const mark = box.querySelector(".cv-mark");
  const markLine = mark.querySelector("line");
  const markDot = mark.querySelector("circle");
  let sel = -1;
  const pick = (i) => {
    if (i === sel) return;
    sel = i;
    mark.classList.add("on");
    markLine.setAttribute("x1", f1(xy[i].x));
    markLine.setAttribute("x2", f1(xy[i].x));
    markDot.setAttribute("cx", f1(xy[i].x));
    markDot.setAttribute("cy", f1(xy[i].y));
    cap.textContent = describePoint(pts[i]);
  };
  pickable(box, {
    locate: (fx) => nearestPoint(pts, (fx * CV.w - CV.x0) / (CV.x1 - CV.x0)),
    pick,
    move: (dx) => pick(clamp((sel < 0 ? pts.length - 1 : sel) + dx, 0, pts.length - 1)),
  });
  return h("div", null, box, cap, h("p", { class: "note tight" }, "У языка нет потолка: шкала растёт вместе со словарём."));
}

// ── Столбики по дням: повторения или чтение ─────────────────────────────────
/** reviews — строки reviewsByDay(), reading — строки readByDay(): оба за одни и те же дни. Переключатель «Повторения / Чтение». */
export function daysChart(reviews, reading) {
  const kinds = {
    reviews: { label: "Повторения", rows: reviews, text: (r) => `${r.n} ${plural(r.n, ["повторение", "повторения", "повторений"])}`, total: (rows) => rows.reduce((a, r) => a + r.n, 0) },
    read: { label: "Чтение", rows: reading, text: (r) => `чтение ${fmtDuration(r.n)}`, total: (rows) => rows.reduce((a, r) => a + r.n, 0) },
  };
  let kind = "reviews";
  let sel = -1;
  const bars = h("div", { class: "days chart pick", role: "group", tabindex: "0" });
  const cap = h("p", { class: "chart-cap", "aria-live": "polite" });
  const axis = h("div", { class: "days-axis" }, h("span", null, fmtDayShort(reviews[0].day)), h("span", null, "сегодня"));
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Что показывать" });
  const paint = () => {
    const k = kinds[kind];
    const max = Math.max(1, ...k.rows.map((r) => r.n));
    bars.setAttribute("aria-label", `${k.label} по дням, последние ${k.rows.length} дней`);
    bars.replaceChildren(...k.rows.map((r, i) => h("div", { class: `day${i === k.rows.length - 1 ? " now" : ""}${i === sel ? " sel" : ""}` }, h("i", { style: { height: `${r.n ? Math.max(6, Math.round((r.n / max) * 100)) : 3}%` } }))));
    cap.textContent = sel < 0 ? `За ${k.rows.length} дней: ${k.text({ n: k.total(k.rows) })}` : `${fmtDayLong(k.rows[sel].day)}: ${k.text(k.rows[sel])}`;
    chips.replaceChildren(...Object.entries(kinds).map(([key, v]) => h("button", { class: "chip", "aria-pressed": String(key === kind), onClick: () => { kind = key; sel = -1; paint(); } }, v.label)));
  };
  const pick = (i) => {
    if (i === sel) return;
    sel = i;
    paint();
  };
  pickable(bars, {
    locate: (fx) => clamp(Math.floor(fx * reviews.length), 0, reviews.length - 1),
    pick,
    move: (dx) => pick(clamp((sel < 0 ? reviews.length - 1 : sel) + dx, 0, reviews.length - 1)),
  });
  paint();
  return h("div", null, chips, bars, axis, cap);
}

// ── Маленький график для главной ────────────────────────────────────────────
/** values — число выученных слов в конце каждого из последних дней. Линия по всей ширине, точка на сегодняшнем дне. */
export function sparkline(values) {
  const W = 72;
  const H = 24;
  const pad = 3;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => ({ x: pad + (i / Math.max(1, values.length - 1)) * (W - 2 * pad), y: hi === lo ? H / 2 : H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad) }));
  const end = pts[pts.length - 1];
  return h("span", { class: "spark", "aria-hidden": "true", html: `<svg viewBox="0 0 ${W} ${H}" focusable="false"><path d="${linePath(pts)}"/><circle cx="${f1(end.x)}" cy="${f1(end.y)}" r="2.6"/></svg>` });
}

// ── Карта книги ─────────────────────────────────────────────────────────────
/** Полоска из глав, подпись «Глава 3 из 12, прочитано 18%» и, пока книга не прочитана, фраза про темп чтения. activity — app.activity. */
export function bookProgressBlock(book, activity) {
  const m = bookMap(book);
  if (!m.total) return null;
  const text = m.finished ? "Книга прочитана" : `Глава ${m.ch + 1} из ${m.total}, прочитано ${m.pct}%`;
  const parts = m.segs
    .map((s) => {
      const gap = s.w * 1000 > 6 ? 2 : 0;
      const x = f1(s.x * 1000 + gap / 2);
      const w = f1(Math.max(0.5, s.w * 1000 - gap));
      return `<rect class="bs-bg" x="${x}" width="${w}" height="12"/>${s.fill > 0 ? `<rect class="bs-fill" x="${x}" width="${f1(w * s.fill)}" height="12"/>` : ""}`;
    })
    .join("");
  const strip = h("div", { class: "bookstrip", role: "img", "aria-label": text, html: `<svg viewBox="0 0 1000 12" preserveAspectRatio="none" focusable="false" aria-hidden="true">${parts}</svg>` });
  const rate = readingPace(activity);
  const pace = m.finished ? "" : paceLine(rate, finishEstimate(book, rate));
  return h("div", { class: "bookmap" }, strip, h("p", { class: "chart-cap" }, text), pace ? h("p", { class: "note tight" }, pace) : null);
}
