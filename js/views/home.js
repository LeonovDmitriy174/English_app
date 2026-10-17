// home.js — главная: что читать дальше, сколько карточек ждёт, серия дней и итоги (прочитанные книги, выученные слова, время чтения).
// Здесь только то, что уже сделано, и нет ни времени следующих повторений, ни таймеров. Расчёты: js/home.js, js/reading.js, js/activity.js.
import { h, icon } from "../dom.js";
import { app, subscribe, queue, resumeBook } from "../store.js";
import { db } from "../db.js";
import { homeSummary } from "../home.js";
import { bookProgress, fmtWords } from "../reading.js";
import { fmtDuration } from "../activity.js";
import { prettyTitle } from "../epub.js";
import { plural } from "./folders.js";
import { cover } from "./cover.js";
import { sparkline } from "./charts.js";
import { openAddWord } from "./addword.js";
import { openAppSettings } from "./settings.js";

let logCache = null; // журнал ответов с прошлого открытия: чтобы серия рисовалась сразу, а уточнялась, когда журнал прочитан

const n = (v, forms) => `${v} ${plural(v, forms)}`;

/** Слово «Gloss» с карандашной чертой: пометка под словом, как в тексте книги. */
function wordmark() {
  const line = h("span", { class: "mark-line", "aria-hidden": "true" });
  line.innerHTML = '<svg viewBox="0 0 100 10" preserveAspectRatio="none" focusable="false"><path d="M2 6.2C18 2.8 34 8.4 52 5.2S86 4 98 5.8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
  return h("h1", { class: "mark" }, h("span", null, "Gloss"), line);
}

export function renderHome(root) {
  let alive = true;
  const view = h("main", { class: "view" });
  root.replaceChildren(view);

  // ── Что читать дальше ───────────────────────────────────────────────────
  function reading() {
    if (!app.books.length) {
      return h(
        "section",
        { class: "h-block" },
        h("p", { class: "h-lead" }, "Начните с книги на английском"),
        h("p", { class: "note" }, "Добавьте файл EPUB или откройте готовую книгу из библиотеки: нажимайте на незнакомые слова, и они попадут в ваш словарь."),
        h("a", { class: "btn primary", href: "#/library" }, icon("book", 20), "Открыть книги"),
      );
    }
    const b = resumeBook() || app.books[0];
    const p = bookProgress(b);
    const started = !!b.opened;
    const where = p.finished ? "Прочитана" : started ? `Глава ${p.ch + 1} из ${p.total}` : "Ещё не открывали";
    const label = p.finished ? "Последняя книга" : started ? "Продолжить чтение" : "Начать чтение";
    return h(
      "a",
      { class: "h-read", href: `#/read/${b.id}`, "aria-label": `${label}: ${b.title}` },
      cover(b),
      h(
        "div",
        { class: "h-read-text" },
        h("div", { class: "h-label" }, label),
        h("div", { class: "h-read-title" }, b.title),
        started && !p.finished && b.chapters[p.ch] ? h("div", { class: "h-read-ch" }, prettyTitle(b.chapters[p.ch].title)) : null,
        h("div", { class: "resume-meta" }, h("div", { class: "bar" }, h("i", { style: { width: `${p.pct}%` } })), where),
      ),
      icon("next", 20),
    );
  }

  // ── Повторение на сегодня ───────────────────────────────────────────────
  function review() {
    if (!app.cards.size) {
      return h(
        "section",
        { class: "h-block" },
        h("p", { class: "h-lead" }, "Слов пока нет"),
        h("p", { class: "note" }, "Нажмите на незнакомое слово в книге или найдите слово кнопкой «+»: оно попадёт в словарь и начнёт повторяться."),
        h("button", { class: "btn", onClick: () => openAddWord() }, icon("plus", 20), "Добавить слово"),
      );
    }
    const q = queue("all");
    const total = q.list.length;
    return h(
      "section",
      { class: "h-review" },
      h(
        "div",
        null,
        total ? h("div", { class: "h-num" }, total) : h("div", { class: "h-done" }, icon("check", 26)),
        h("div", { class: "h-cap" }, total ? `${plural(total, ["карточка", "карточки", "карточек"])} к повторению` : "На сегодня всё"),
        total ? h("div", { class: "h-sub" }, `${q.due.length} на повторение, ${q.fresh.length} новых`) : null,
        q.held ? h("div", { class: "h-sub" }, `ещё ${q.held} подождут до завтра`) : null,
      ),
      total ? h("a", { class: "btn primary", href: "#/review" }, "Повторить") : null,
    );
  }

  // ── Серия и неделя ──────────────────────────────────────────────────────
  function streakBlock(s) {
    return h(
      "section",
      { class: "h-streak" },
      s.streak
        ? h("div", { class: "h-streak-top" }, h("span", { class: "h-num big" }, s.streak), h("span", { class: "h-cap" }, h("b", null, plural(s.streak, ["день", "дня", "дней"]) + " подряд"), s.best > s.streak ? h("small", null, `Рекорд: ${s.best}`) : s.best === s.streak && s.streak > 1 ? h("small", null, "Это ваш рекорд") : null))
        : h("div", { class: "h-streak-top" }, h("span", { class: "h-cap" }, h("b", null, s.activeToday ? "Первый день серии" : "Серия начнётся сегодня"), s.best ? h("small", null, `Рекорд: ${s.best}`) : null)),
      h(
        "ol",
        { class: "h-week", "aria-label": "Занятия за последние семь дней" },
        s.week.map((d) => {
          const parts = [d.reviews && n(d.reviews, ["повторение", "повторения", "повторений"]), d.readSec >= 60 && `чтение ${fmtDuration(d.readSec)}`].filter(Boolean);
          return h("li", { class: `${d.active ? "on" : ""}${d.today ? " now" : ""}`, title: parts.join(", ") || "занятий не было", "aria-label": `${d.label}: ${d.active ? parts.join(", ") || "были занятия" : "занятий не было"}` }, h("span", null, d.label), h("i"));
        }),
      ),
      h("p", { class: "note tight" }, "Занятие: хотя бы одно повторение или минута чтения."),
    );
  }

  // ── Итоги ───────────────────────────────────────────────────────────────
  function ledger(s) {
    // у «Выучено слов» рядом с числом маленькая кривая за 30 дней и прирост: растёт словарь или стоит
    const trend = s.learnedTrend;
    const gain = trend ? trend[trend.length - 1] - trend[0] : 0;
    const base = s.words.total ? `из ${s.words.total.toLocaleString("ru-RU")} в словаре` : "в словаре пока пусто";
    const rows = [
      ["Выучено слов", s.words.learned, gain > 0 ? `${base}, +${gain} за 30 дней` : base, trend && sparkline(trend)],
      ["Прочитано книг", s.books.finished, s.books.total ? `из ${s.books.total} на полке${s.books.reading ? `, ещё ${s.books.reading} читается` : ""}` : "книг на полке нет"],
      ["Прочитано слов", s.wordsRead ? fmtWords(s.wordsRead) : "0", "по вашему месту в книгах"],
      ["Чтение за неделю", fmtDuration(s.weekReadSec), s.todayReadSec >= 60 ? `сегодня ${fmtDuration(s.todayReadSec)}` : "сегодня пока нет"],
      ["Повторений за неделю", s.weekReviews, s.todayReviews ? `сегодня ${s.todayReviews}` : "сегодня пока нет"],
    ];
    return h("dl", { class: "h-ledger" }, rows.map(([k, v, sub, spark]) => h("div", { class: "h-row" }, h("dt", null, k, h("small", null, sub)), h("dd", { class: spark ? "has-spark" : null }, spark, v))));
  }

  function paint() {
    if (!alive) return;
    const s = homeSummary({ cards: app.cards.values(), books: app.books, log: logCache || [], activity: app.activity });
    view.replaceChildren(
      h(
        "div",
        { class: "page home" },
        h(
          "header",
          { class: "top" },
          h("div", null, wordmark(), h("p", { class: "sub" }, new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }))),
          h("div", { class: "top-actions" }, h("button", { class: "iconbtn", "aria-label": "Добавить слово", onClick: () => openAddWord() }, icon("plus", 24)), h("button", { class: "iconbtn", "aria-label": "Настройки", onClick: () => openAppSettings() }, icon("sliders", 22))),
        ),
        reading(),
        review(),
        streakBlock(s),
        ledger(s),
        h("div", { class: "h-links" }, h("a", { class: "linkbtn", href: "#/progress" }, "Подробный прогресс"), app.notes.length > 0 && h("a", { class: "linkbtn", href: "#/notes" }, `Заметки · ${app.notes.length}`)),
      ),
    );
  }

  paint();
  const off = subscribe(paint);
  db.all("log")
    .then((rows) => {
      logCache = rows;
      paint();
    })
    .catch(() => {
      /* журнал не открылся: главная остаётся с тем, что есть */
    });
  return () => {
    alive = false;
    off();
  };
}
