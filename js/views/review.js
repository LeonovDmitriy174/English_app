// review.js — повторение словаря: стартовый экран, ход одного захода и итог. Сами задания в tasks.js.
import { h, icon, toast, copyText, openSheet } from "../dom.js";
import { app, subscribe, queue, hardCount, answerCard, ensureContexts, kindClass } from "../store.js";
import { newTracker, judgeInSession, requeuePosition } from "../session.js";
import { MODES, DEFAULT_MIX, pickTask } from "../modes.js";
import { applyPace } from "../pace.js";
import { leechReport } from "../leech.js";
import { createTasks } from "./tasks.js";
import { runPairs } from "./pairs.js";
import { openDictSettings, modeAvailable, mixModes } from "./dictsettings.js";
import { openProgress } from "./progress.js";

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

const SCOPES = [
  ["all", "Все"],
  ["w", "Слова"],
  ["pv", "Фразовые глаголы"],
  ["id", "Идиомы"],
];
const prefs = { mode: "mix", scope: "all" };
/** Сколько карточек в коротком заходе «5 минут». */
export const SHORT_SESSION = 10;

/** Режимы стартового экрана: микс и отдельные режимы (без тех, что недоступны на этом устройстве). */
function modeList() {
  const mix = mixModes();
  const all = MODES.filter((m) => modeAvailable(m.key));
  const names = mix.map((k) => MODES.find((m) => m.key === k).name);
  const isDefault = mix.length === DEFAULT_MIX.filter(modeAvailable).length && mix.every((k) => DEFAULT_MIX.includes(k));
  const desc = isDefault ? "От простого к сложному" : `Только: ${names.join(", ")}`;
  return [["mix", "Микс", desc], ...all.map((m) => [m.key, m.name, m.short])];
}

export function renderReview(root) {
  let session = null;
  let warming = false; // идёт разминка «Пары»: обновления данных её не закрывают
  const view = h("main", { class: "view" });
  root.replaceChildren(view);
  ensureContexts(); // в фоне, пока вы на этом экране: найти в книгах предложения для заданий «Слово в предложении»

  // ── стартовый экран ─────────────────────────────────────────────────────
  function home() {
    session = null;
    warming = false;
    view.className = "view";
    document.body.classList.remove("immersive");
    if (prefs.mode !== "mix" && !modeAvailable(prefs.mode)) prefs.mode = "mix";
    const hard = hardCount();
    if (prefs.scope === "hard" && !hard) prefs.scope = "all";
    const q = queue(prefs.scope);
    const total = q.list.length;
    const page = h(
      "div",
      { class: "page" },
      h("header", { class: "top" }, h("h1", { class: "title" }, "Повторение"), h("div", { class: "top-actions" }, h("button", { class: "iconbtn", "aria-label": "Прогресс", onClick: () => openProgress() }, icon("chart", 22)), h("button", { class: "iconbtn", "aria-label": "Настройки словаря", onClick: () => openDictSettings() }, icon("sliders", 22)))),
    );

    if (!app.cards.size) {
      page.append(
        h(
          "section",
          { class: "empty" },
          h("p", { class: "lead" }, "Пока нечего повторять"),
          h("p", null, "Добавьте несколько слов из книги в словарь, и здесь появятся карточки. Повторения раскладываются по времени так, чтобы вы забывали слова как можно реже."),
          h("button", { class: "btn primary", onClick: () => (location.hash = "#/library") }, "Открыть книгу"),
        ),
      );
      view.replaceChildren(page);
      return;
    }

    // Задания берут варианты ответов и предложения из общего словаря: в самые первые секунды после запуска он ещё разбирается
    const loading = app.dict.state === "loading";
    const scopes = hard ? [SCOPES[0], ["hard", "Трудные", hard], ...SCOPES.slice(1)] : SCOPES;
    const isHard = prefs.scope === "hard";
    page.append(
      isHard
        ? h("p", { class: "lead" }, `Трудных слов: ${total}`)
        : total
          ? h("p", { class: "lead" }, `К повторению: ${total} ${plural(total, ["карточка", "карточки", "карточек"])}`)
          : h("p", { class: "lead" }, "На сегодня всё"),
      h("p", { class: "sub" }, isHard ? "Слова, в которых вы ошибались чаще всего. Здесь они повторяются вне очереди." : total ? `${q.due.length} на повторение, ${q.fresh.length} новых` : "Когда слова будут готовы к повторению, на вкладке появится число."),
      h(
        "div",
        { class: "modes", role: "radiogroup", "aria-label": "Режим" },
        modeList().map(([key, name, desc]) =>
          h(
            "button",
            {
              class: "mode",
              role: "radio",
              "aria-checked": String(prefs.mode === key),
              onClick: () => {
                prefs.mode = key;
                home();
              },
            },
            h("span", { class: "radio" }),
            h("span", null, h("b", null, name), h("span", { class: "d" }, desc)),
          ),
        ),
      ),
      h(
        "div",
        { class: "scope", role: "group", "aria-label": "Что повторять" },
        scopes.map(([key, label, n]) =>
          h(
            "button",
            {
              class: "chip",
              "aria-pressed": String(prefs.scope === key),
              onClick: () => {
                prefs.scope = key;
                home();
              },
            },
            label,
            n != null && h("span", { class: "n" }, n),
          ),
        ),
      ),
      h(
        "div",
        { class: "start-row" },
        h("button", { class: "btn primary grow", disabled: !total || loading, onClick: () => start() }, loading ? "Загружаю словарь…" : total ? "Начать" : "Нет карточек"),
        total > SHORT_SESSION && h("button", { class: "btn quiet", disabled: loading, onClick: () => start(SHORT_SESSION) }, "5 минут"),
      ),
      h(
        "div",
        { class: "start-extra" },
        total >= 3 && !loading && h("button", { class: "linkbtn", onClick: warmUp }, "Разминка: пары"),
        isHard && h("button", { class: "linkbtn", onClick: copyHard }, "Скопировать трудные слова"),
      ),
    );
    view.replaceChildren(page);
    // выбранная область не должна прятаться за краем ряда
    const row = page.querySelector(".scope");
    const on = row?.querySelector('[aria-pressed="true"]');
    if (on) {
      const over = on.getBoundingClientRect().right - row.getBoundingClientRect().right;
      if (over > -24) row.scrollLeft += over + 24;
    }
  }

  // ── сессия ──────────────────────────────────────────────────────────────
  /** limit — сколько карточек взять (короткий заход); без него берётся вся очередь. */
  function start(limit) {
    const q = queue(prefs.scope);
    if (!q.list.length) return;
    const modes = prefs.mode === "mix" ? mixModes() : [prefs.mode];
    const list = limit ? q.list.slice(0, limit) : q.list;
    session = { ids: list.map((c) => c.id), i: 0, done: 0, right: 0, tracker: newTracker(), modes };
    nextCard();
  }

  /** Разминка «Пары»: сначала слова с низким уровнем, их полезнее всего вспомнить заранее. */
  function warmUp() {
    const cards = [...queue(prefs.scope).list].sort((a, b) => a.srs.lv - b.srs.lv);
    warming = runPairs({ view, cards, onExit: home });
    if (!warming) toast("Для разминки нужно хотя бы три слова с коротким переводом");
  }

  /** Список трудных слов в буфер обмена: его можно отправить Claude и вместе придумать ассоциации. */
  async function copyHard() {
    const text = leechReport([...app.cards.values()]);
    if (!text) return;
    if (await copyText(text)) return toast("Список скопирован");
    // буфер недоступен: показываем текст, чтобы его можно было выделить и скопировать вручную
    const area = h("textarea", { class: "field copybox", readonly: true, rows: 12, "aria-label": "Трудные слова" }, text);
    openSheet({ label: "Трудные слова", content: h("div", null, h("h2", { class: "set-title" }, "Трудные слова"), h("p", { class: "note tight" }, "Выделите текст и скопируйте его."), area) });
    area.select();
  }

  function frame(card, body, foot) {
    view.className = "view no-tabs";
    document.body.classList.add("immersive");
    const pct = session.ids.length ? (session.i / session.ids.length) * 100 : 0;
    view.replaceChildren(
      h(
        "div",
        { class: "rv-stage" },
        h(
          "div",
          { class: "rv-top" },
          h("button", { class: "iconbtn", "aria-label": "Закончить повторение", onClick: home }, icon("close", 24)),
          h("div", { class: "rv-progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": session.ids.length, "aria-valuenow": session.i }, h("i", { style: { width: `${pct}%` } })),
          h("span", { class: "rv-count" }, `${Math.min(session.i + 1, session.ids.length)} из ${session.ids.length}`),
        ),
        h("div", { class: `paper ${kindClass(card.t)}` }, body),
        h("div", { class: "rv-foot" }, foot),
      ),
    );
  }

  /**
   * Записывает ответ и ведёт сессию дальше. Время и уровень пользователю не показываются, кроме индикатора.
   * Правило захода (session.js): слово поднимается не больше чем на уровень за заход, а после ошибки
   * возвращается ещё раз, чтобы закрепить ответ, но уровень от этого уже не растёт.
   */
  async function record(card, result, task, ctxText = "", { ms = null, len = 0 } = {}) {
    // медленный верный ответ уровень не поднимает (js/pace.js); сессия видит его как «почти»
    const paced = applyPace(result, task, ms, { len, enabled: app.settings.speedRule !== false });
    const { effective, requeue, again } = judgeInSession(session.tracker, card.id, paced);
    const res = await answerCard(card.id, effective, { task, ctxText, ms, lapse: !again });
    session.done += 1;
    if (result === "ok") session.right += 1;
    session.i += 1;
    if (requeue) session.ids.splice(requeuePosition(session.i, session.ids.length), 0, card.id);
    return res;
  }

  const tasks = createTasks({ view, frame, record, next: () => nextCard() });

  function nextCard() {
    if (session.i >= session.ids.length) return finish();
    const card = app.cards.get(session.ids[session.i]);
    if (!card || card.skip) {
      session.i += 1;
      return nextCard();
    }
    const task = pickTask({ lv: card.srs.lv, modes: session.modes, can: (t) => tasks.can(card, t) });
    tasks.run(task, card);
  }

  function finish() {
    view.className = "view";
    document.body.classList.remove("immersive");
    const { done, right } = session;
    session = null;
    view.replaceChildren(
      h(
        "div",
        { class: "page" },
        h(
          "section",
          { class: "done" },
          h("p", { class: "lead" }, "Готово"),
          h("p", { class: "sub", style: { margin: "8px 0 26px" } }, done ? `Верных ответов: ${right} из ${done}.` : "Повторение закончено."),
          h("button", { class: "btn primary", onClick: home }, "Вернуться"),
        ),
      ),
    );
  }

  const off = subscribe(() => {
    if (!session && !warming) home();
  });
  home();
  return () => {
    off();
    document.body.classList.remove("immersive");
  };
}
