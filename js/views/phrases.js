// phrases.js — «Разговорные фразы»: проверка фраз для живой речи в формате «Пополнить словарь»: фраза, четыре перевода,
// верный ответ добавляет фразу в словарь знакомой, неверный новой. Правила — js/freqdeck.js (decide) и js/store/replenish.js,
// колода и состояние — js/phrasedeck.js, сами фразы — js/phrasedata.js. Оформление то же, что у «Пополнить словарь».
import { h, icon, toast } from "../dom.js";
import { app, loadPhraseState, savePhraseState, replenishAnswer, newSpreadPlan, newSeriesId, undoSeries, posLabel } from "../store.js";
import { buildChoices, optionText } from "../choices.js";
import { speak, canSpeak } from "../tts.js";
import { levelBar } from "./level.js";
import { phraseDeck, overview, queueFor, nextGroup, markDone, splitExample } from "../phrasedeck.js";

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};
const phrases = (n) => `${n} ${plural(n, ["фраза", "фразы", "фраз"])}`;
const CORRECT_PAUSE = 650; // после верного ответа следующая фраза появляется сама; после ошибки ждём «Дальше»

export function renderPhrases(root) {
  const view = h("main", { class: "view" });
  root.replaceChildren(view);
  const deck = phraseDeck();
  let alive = true;
  let state = null;
  let run = null; // идущая проверка
  let timer = 0;

  async function load() {
    view.replaceChildren(h("div", { class: "page" }, h("header", { class: "top" }, h("h1", { class: "title" }, "Разговорные фразы")), h("p", { class: "note" }, "Загружаю…")));
    state = await loadPhraseState();
    if (!alive) return;
    home();
  }

  // ── стартовый экран ─────────────────────────────────────────────────────
  function home() {
    clearTimeout(timer);
    run = null;
    view.className = "view";
    document.body.classList.remove("immersive");
    const o = overview(state, deck);
    const page = h("div", { class: "page" }, h("header", { class: "top" }, h("div", null, h("h1", { class: "title" }, "Разговорные фразы")), h("div", { class: "top-actions" }, h("button", { class: "iconbtn", "aria-label": "К словарю", onClick: () => (location.hash = "#/dict") }, icon("close", 24)))));
    view.replaceChildren(page);
    const parts = [
      h("p", { class: "lead" }, o.done ? `Проверено ${o.done} из ${o.total}` : `${phrases(o.total)} для живой речи`),
      h("p", { class: "sub" }, "Выражения, которые звучат в разговоре и в сериалах: «how's it going», «fair enough», «I couldn't care less». Выберите верный перевод: фраза, которую вы знаете, добавится в словарь как знакомая, а незнакомая как новая. Закончить можно в любой момент."),
      h("div", { class: "start-row", style: { marginTop: "20px" } }, h("button", { class: "btn primary grow", onClick: () => start("all", o.finished) }, o.finished ? "Пройти заново" : o.done ? "Продолжить" : "Начать")),
      h("div", { class: "rp-blocks" }, o.groups.map(groupRow)),
    ];
    page.append(...parts.filter(Boolean));
  }

  function groupRow(g) {
    const status = g.complete ? h("span", { class: "rp-st ok" }, icon("check", 16), "проверена") : h("span", { class: "rp-st" }, g.checked ? `проверено ${g.checked} из ${g.size}` : `${phrases(g.size)}`);
    return h(
      "div",
      { class: "rp-block" },
      h("div", { class: "rp-bh" }, h("b", null, g.name), status),
      h("div", { class: "rp-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": g.size, "aria-valuenow": g.checked }, h("i", { style: { width: `${(g.checked / g.size) * 100}%` } })),
      h("button", { class: "btn quiet block", onClick: () => start(g.key, g.complete) }, g.complete ? "Пройти тему заново" : g.checked ? "Продолжить тему" : "Начать тему"),
    );
  }

  // ── проверка ────────────────────────────────────────────────────────────
  function start(scope, restart = false) {
    const queue = queueFor(deck, state, scope, { restart });
    if (!queue.length) return toast("Здесь всё уже проверено");
    run = { scope, queue, i: 0, stats: { n: 0, ok: 0, add: 0, fresh: 0, drop: 0, keep: 0, skipped: 0 }, plan: newSpreadPlan(), series: newSeriesId(), marked: [], undone: 0 };
    next();
  }

  function next() {
    clearTimeout(timer);
    const entry = run.queue[run.i];
    if (!entry) return done(true);
    const built = buildChoices(entry, deck.glossary, [], {});
    if (!built || built.options.length < 3) {
      run.stats.skipped += 1;
      return record(entry).then(step);
    }
    ask(entry, built);
  }

  const step = () => {
    run.i += 1;
    next();
  };

  /** Запоминает, что фраза проверена, сразу после ответа: «Закончить» в любой момент не теряет ни одной фразы. */
  async function record(entry) {
    if (!state.done[entry.id]) run.marked.push(entry.id);
    markDone(state, entry.id);
    await savePhraseState();
  }

  function frame(body, foot, share, count) {
    view.className = "view no-tabs";
    document.body.classList.add("immersive");
    view.replaceChildren(
      h(
        "div",
        { class: "rv-stage" },
        h(
          "div",
          { class: "rv-top" },
          h("button", { class: "rp-end", onClick: () => done(false) }, "Закончить"),
          h("div", { class: "rv-progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(share * 100) }, h("i", { style: { width: `${share * 100}%` } })),
          h("span", { class: "rv-count rp-count" }, count),
        ),
        h("div", { class: "paper k-id" }, body),
        h("div", { class: "rv-foot" }, foot),
      ),
    );
  }

  function ask(entry, built) {
    const { options, kind } = built;
    const t0 = performance.now();
    let answered = false;
    let moved = false;
    const go = () => {
      if (moved) return;
      moved = true;
      clearTimeout(timer);
      step();
    };
    const list = h(
      "div",
      { class: "choices", role: "group", "aria-label": "Выберите перевод" },
      options.map((o) => h("button", { class: "opt", onClick: () => pick(o) }, h("span", { class: "t" }, o.text))),
    );
    const prompt = h("p", { class: "rv-hint" }, "Выберите перевод");
    const after = h("div", { class: "rv-after" });
    const idk = h("button", { class: "linkbtn idk", onClick: () => pick(null) }, "Не знаю");
    const parts = splitExample(entry);
    const head = h(
      "div",
      null,
      h("div", { class: "slip-head", style: { borderBottom: "0", paddingBottom: "0" } }, h("div", null, h("h2", { class: "rv-hw" }, entry.w), h("p", { class: "meta" }, posLabel(entry))), canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(entry.w) }, icon("speaker", 24))),
      parts && h("div", { class: "rv-ctx" }, h("blockquote", { class: "cite" }, parts[0], h("mark", null, parts[1]), parts[2])),
    );
    const foot = h("div");
    frame(h("div", { class: "rv-body choose" }, head, prompt, after, list, idk), foot, run.i / run.queue.length, `${run.i + 1} из ${run.queue.length}`);

    async function pick(chosen) {
      if (answered) return;
      answered = true;
      const ms = performance.now() - t0;
      list.classList.add("locked");
      prompt.remove();
      idk.remove();
      const ok = !!chosen?.ok;
      const res = await replenishAnswer(entry, ok, { ms, plan: run.plan, series: run.series });
      [...list.children].forEach((b, i) => {
        const o = options[i];
        b.classList.add(o.ok ? "right" : o === chosen ? "wrong" : "dim");
        if (o.ok || o === chosen) b.append(icon(o.ok ? "check" : "close", 20));
      });
      if (app.settings.speakOnTap) speak(entry.w);
      count(res.kind, ok);
      await record(entry);
      if (ok) {
        foot.append(h("button", { class: "btn primary block", onClick: go }, "Дальше"));
        timer = setTimeout(go, CORRECT_PAUSE);
        return;
      }
      const full = entry[kind];
      if (full && optionText(entry, kind) !== full) after.append(h("p", { class: "ru" }, full));
      after.append(h("div", { class: "rp-fate" }, fateNote(res)));
      foot.append(h("button", { class: "btn primary block", onClick: go }, "Дальше"));
      setTimeout(() => foot.querySelector(".btn")?.focus(), 30);
    }
  }

  /** Что стало с фразой после ошибки: одна строка под ответом. */
  function fateNote(res) {
    if (res.kind === "fresh") return h("p", { class: "note tight" }, "Фраза добавлена в словарь как новая.");
    if (res.kind === "drop") return h("p", { class: "note tight rp-lvl" }, "Фраза уже в словаре, уровень снижен ", levelBar(res.card.srs.lv));
    return h("p", { class: "note tight" }, "Фраза уже в словаре.");
  }

  function count(kind, ok) {
    const st = run.stats;
    st.n += 1;
    if (ok) st.ok += 1;
    st[kind] += 1;
  }

  // ── итоги ───────────────────────────────────────────────────────────────
  function summaryLines(s) {
    return [s.add && `Добавлено как знакомые: ${s.add}`, s.fresh && `Добавлено как новые: ${s.fresh}`, s.drop && `Уровень снижен у фраз: ${s.drop}`, s.keep && `Уже были в словаре: ${s.keep}`, run.undone && `Убрано из словаря: ${run.undone}`].filter(Boolean);
  }

  /** «Убрать всё добавленное этой серией»: фразы, которые добавила эта проверка, уходят из словаря и снова считаются непроверенными. */
  function undoControl(rerender) {
    const n = run.stats.add + run.stats.fresh;
    if (!n || run.undone) return null;
    const box = h("div", { class: "rp-undo" });
    const idle = () => box.replaceChildren(h("button", { class: "linkbtn danger-link", onClick: ask }, "Убрать всё добавленное этой серией"));
    const ask = () =>
      box.replaceChildren(
        h("p", { class: "note tight" }, `Убрать из словаря ${phrases(n)}, которые добавила эта серия? Они снова станут непроверенными. Фразы, что уже были в словаре, останутся.`),
        h("div", { class: "rp-undo-act" }, h("button", { class: "btn danger", onClick: go }, "Убрать"), h("button", { class: "btn quiet", onClick: idle }, "Отмена")),
      );
    const go = async () => {
      const removed = await undoSeries(run.series);
      run.marked.forEach((id) => delete state.done[id]);
      run.marked = [];
      await savePhraseState();
      run.undone = removed;
      run.stats.add = 0;
      run.stats.fresh = 0;
      toast(`Убрано из словаря: ${phrases(removed)}`);
      rerender();
    };
    idle();
    return box;
  }

  function done(finishedQueue) {
    clearTimeout(timer);
    run.finished = finishedQueue;
    const s = run.stats;
    const o = overview(state, deck);
    const left = queueFor(deck, state, run.scope).length;
    const group = left ? null : nextGroup(deck, state, run.scope);
    const lead = finishedQueue ? (run.scope === "all" || !deck.groups.find((g) => g.key === run.scope) ? "Все фразы проверены" : `Тема «${deck.groups.find((g) => g.key === run.scope).name}» проверена`) : s.n ? `Проверено ${phrases(s.n)}` : "Заходите, когда будет время";
    view.className = "view";
    document.body.classList.remove("immersive");
    view.replaceChildren(
      h(
        "div",
        { class: "page" },
        h(
          "section",
          { class: "done" },
          h("p", { class: "lead" }, lead),
          s.n ? h("p", { class: "sub" }, `Верных ответов: ${s.ok} из ${s.n}.`) : h("p", { class: "sub" }, "Место сохранено."),
          h("ul", { class: "rp-lines" }, summaryLines(s).map((t) => h("li", null, t))),
          undoControl(() => done(run.finished)),
          h(
            "div",
            { class: "start-row", style: { marginTop: "26px", width: "100%" } },
            left ? h("button", { class: "btn primary grow", onClick: () => start(run.scope) }, "Продолжить") : group ? h("button", { class: "btn primary grow", onClick: () => start(group.key) }, `Дальше: ${group.name}`) : null,
            h("button", { class: left || group ? "btn quiet" : "btn primary grow", onClick: home }, "Готово"),
          ),
          o.finished && h("p", { class: "note tight" }, "Вся колода пройдена. Фразы из словаря теперь придут в повторение вместе с остальными словами."),
        ),
      ),
    );
  }

  load();
  return () => {
    alive = false;
    clearTimeout(timer);
    document.body.classList.remove("immersive");
  };
}
