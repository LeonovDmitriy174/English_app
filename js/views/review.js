// review.js — повторение словаря: карточки, написание, слово в предложении, микс.
import { h, icon } from "../dom.js";
import { app, subscribe, queue, answerCard, kindClass, posLabel } from "../store.js";
import { isNew } from "../levels.js";
import { levelBar } from "./level.js";
import { distance } from "../lex.js";
import { speak, canSpeak } from "../tts.js";

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

const MODES = [
  ["mix", "Микс", "Новые слова — карточкой, дальше режимы чередуются"],
  ["card", "Карточки", "Видите слово и вспоминаете перевод"],
  ["spell", "Написание", "Видите перевод и пишете слово по-английски"],
  ["cloze", "Слово в предложении", "Вставляете пропущенное слово в предложение из книги"],
];
const SCOPES = [
  ["all", "Все"],
  ["w", "Слова"],
  ["pv", "Фразовые глаголы"],
  ["id", "Идиомы"],
];
const prefs = { mode: "mix", scope: "all" };

const normAnswer = (s) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const wordCount = (s) => s.trim().split(/\s+/).length;

function clozeOk(card) {
  const ctx = card.ctx?.[0];
  if (!ctx) return false;
  return wordCount(ctx.s.slice(ctx.a, ctx.b)) === wordCount(card.w);
}

function pickMode(card) {
  const m = prefs.mode;
  if (m === "card" || m === "spell") return m;
  const cloze = clozeOk(card);
  if (m === "cloze") return cloze ? "cloze" : "card";
  if (isNew(card.srs)) return "card";
  const pool = cloze ? ["card", "spell", "cloze", "cloze"] : ["card", "spell"];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Оценка ответа: 'ok' | 'near' | 'no'. */
function judge(answer, expected) {
  const a = normAnswer(answer);
  const e = normAnswer(expected);
  if (!a) return "no";
  if (a === e) return "ok";
  const d = distance(a, e);
  return d === 1 || (e.length >= 8 && d === 2) ? "near" : "no";
}

export function renderReview(root) {
  let session = null;
  const view = h("main", { class: "view" });
  root.replaceChildren(view);

  // ── стартовый экран ─────────────────────────────────────────────────────
  function home() {
    session = null;
    view.className = "view";
    document.body.classList.remove("immersive");
    const q = queue(prefs.scope);
    const total = q.list.length;
    const page = h("div", { class: "page" }, h("header", { class: "top" }, h("h1", { class: "title" }, "Повторение")));

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

    page.append(
      total
        ? h("p", { class: "lead" }, `К повторению: ${total} ${plural(total, ["карточка", "карточки", "карточек"])}`)
        : h("p", { class: "lead" }, "На сегодня всё"),
      h("p", { class: "sub" }, total ? `${q.due.length} на повторение, ${q.fresh.length} новых` : "Когда слова будут готовы к повторению, на вкладке появится число."),
      h(
        "div",
        { class: "modes", role: "radiogroup", "aria-label": "Режим" },
        MODES.map(([key, name, desc]) =>
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
        SCOPES.map(([key, label]) =>
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
          ),
        ),
      ),
      h("button", { class: "btn primary block", disabled: !total, onClick: start }, total ? "Начать" : "Нет карточек"),
    );
    view.replaceChildren(page);
  }

  // ── сессия ──────────────────────────────────────────────────────────────
  function start() {
    const q = queue(prefs.scope);
    if (!q.list.length) return;
    session = { ids: q.list.map((c) => c.id), i: 0, done: 0, right: 0 };
    nextCard();
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

  function headword(card, big = true, lv = card.srs.lv, gained = false) {
    return h(
      "div",
      { class: "slip-head", style: { borderBottom: "0", paddingBottom: "0" } },
      h("div", null, h("h2", { class: big ? "rv-hw" : "hw" }, card.w), h("p", { class: "meta" }, posLabel(card)), h("p", { class: "meta lvl-line" }, levelBar(lv, gained))),
      canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(card.w) }, icon("speaker", 24)),
    );
  }

  function quote(card) {
    const ctx = card.ctx?.[0];
    if (!ctx) return null;
    return [
      h("blockquote", { class: "cite" }, ctx.s.slice(0, ctx.a), h("mark", null, ctx.s.slice(ctx.a, ctx.b)), ctx.s.slice(ctx.b)),
      h("p", { class: "src" }, [ctx.book, ctx.ch].filter(Boolean).join(", ")),
    ];
  }

  function answerBlock(card) {
    return [card.ru ? h("p", { class: "ru" }, card.ru) : card.rm && h("p", { class: "ru auto" }, card.rm), card.en && h("p", { class: "def" }, card.en), quote(card), card.ex && h("p", { class: "exl" }, h("small", null, "Пример"), card.ex)];
  }

  /** Записывает ответ и ведёт сессию дальше. Время и уровень пользователю не показываются, кроме индикатора. */
  async function record(card, result, written) {
    const res = await answerCard(card.id, result, { written });
    session.done += 1;
    if (result === "ok") session.right += 1;
    if (res.card.srs.due - Date.now() <= 20 * 60000) session.ids.push(card.id); // вернётся в этой же сессии
    session.i += 1;
    return res;
  }

  const nextBtn = () => h("button", { class: "btn primary block", onClick: nextCard }, "Дальше");

  function nextCard() {
    if (session.i >= session.ids.length) return finish();
    const card = app.cards.get(session.ids[session.i]);
    if (!card) {
      session.i += 1;
      return nextCard();
    }
    const mode = pickMode(card);
    if (mode === "spell") return spell(card);
    if (mode === "cloze") return cloze(card);
    return flash(card);
  }

  // Режим 1: карточка. Вспомнили или нет: уровень считается сам.
  function flash(card) {
    frame(
      card,
      h("div", { class: "rv-body" }, headword(card), h("p", { class: "rv-hint" }, "Вспомните перевод, затем проверьте себя")),
      h("button", { class: "btn primary block", onClick: reveal }, "Показать ответ"),
    );
    function reveal() {
      const verdict = (result) => async (e) => {
        e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => (b.disabled = true));
        await record(card, result, false);
        nextCard();
      };
      frame(
        card,
        h("div", { class: "rv-body" }, headword(card, false), h("div", { style: { marginTop: "12px" } }, answerBlock(card))),
        h("div", { class: "grades two" }, h("button", { class: "grade", onClick: verdict("no") }, "Не помню"), h("button", { class: "grade good", onClick: verdict("ok") }, "Помню")),
      );
      if (app.settings.speakOnTap) speak(card.w);
    }
  }

  // Режим 2: написание по переводу
  function spell(card) {
    const input = h("input", { class: "field en", type: "text", placeholder: "По-английски", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "done", "aria-label": "Ответ" });
    const hint = h("p", { class: "rv-hint" });
    let hinted = false;
    const showHint = h(
      "button",
      {
        class: "linkbtn",
        onClick: () => {
          hinted = true;
          hint.textContent = `Начинается на «${card.w[0]}», символов: ${card.w.length}`;
          showHint.remove();
          input.focus();
        },
      },
      "Подсказка",
    );
    const check = () => finish(input.value);
    const give = h("button", { class: "linkbtn", onClick: () => finish("") }, "Не помню");
    input.addEventListener("keydown", (e) => e.key === "Enter" && check());

    frame(
      card,
      h(
        "div",
        { class: "rv-body" },
        h("p", { class: "meta" }, posLabel(card)),
        h("p", { class: "ru", style: { fontSize: "28px", marginTop: "10px" } }, card.ru || card.rm || card.en),
        (card.ru || card.rm) && card.en && h("p", { class: "def" }, card.en),
        hint,
        h("div", { class: "answer" }, input, h("button", { class: "btn primary", onClick: check }, "Проверить")),
        h("div", { style: { display: "flex", gap: "20px" } }, showHint, give),
      ),
      null,
    );
    setTimeout(() => input.focus(), 60);

    async function finish(value) {
      const verdict = judge(value, card.w);
      // верно, но с подсказкой, и «почти»: уровень остаётся прежним
      const result = verdict === "ok" ? (hinted ? "near" : "ok") : verdict === "near" ? "near" : "no";
      const res = await record(card, result, true);
      const fb =
        verdict === "ok"
          ? h("div", { class: "fb ok" }, "Верно")
          : verdict === "near"
            ? h("div", { class: "fb no" }, "Почти. Правильно: ", h("span", { class: "was" }, card.w))
            : h("div", { class: "fb no" }, value.trim() ? "Не совпало. Правильно: " : "Правильный ответ: ", h("span", { class: "was" }, card.w));
      frame(card, h("div", { class: "rv-body" }, headword(card, false, res.after, res.after > res.before), fb, h("div", { style: { marginTop: "6px" } }, answerBlock(card))), nextBtn());
      focusNext();
      if (app.settings.speakOnTap) speak(card.w);
    }
  }

  // Режим 3: слово в предложении
  function cloze(card) {
    const ctx = card.ctx[0];
    const expected = ctx.s.slice(ctx.a, ctx.b);
    const input = h("input", { class: "field en", type: "text", placeholder: "Слово", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "done", "aria-label": "Пропущенное слово" });
    const check = () => finish(input.value);
    input.addEventListener("keydown", (e) => e.key === "Enter" && check());
    const give = h("button", { class: "linkbtn", onClick: () => finish("") }, "Не помню");

    frame(
      card,
      h(
        "div",
        { class: "rv-body" },
        h("p", { class: "meta" }, posLabel(card)),
        h("p", { class: "cloze" }, ctx.s.slice(0, ctx.a), h("span", { class: "blank", "aria-label": "пропуск" }), ctx.s.slice(ctx.b)),
        h("p", { class: "rv-hint" }, `Подсказка: ${card.ru || card.rm || card.en}`),
        h("div", { class: "answer" }, input, h("button", { class: "btn primary", onClick: check }, "Проверить")),
        h("div", null, give),
      ),
      null,
    );
    setTimeout(() => input.focus(), 60);

    async function finish(value) {
      let verdict = judge(value, expected);
      let note = null;
      if (verdict !== "ok" && normAnswer(value) === normAnswer(card.w)) {
        verdict = "near";
        note = "Слово верное, но в предложении другая форма: ";
      }
      const result = verdict === "ok" ? "ok" : verdict === "near" ? "near" : "no";
      const res = await record(card, result, true);
      const fb =
        verdict === "ok"
          ? h("div", { class: "fb ok" }, "Верно")
          : h("div", { class: "fb no" }, note || (verdict === "near" ? "Почти. В предложении: " : value.trim() ? "Не совпало. В предложении: " : "В предложении: "), h("span", { class: "was" }, expected));
      frame(
        card,
        h(
          "div",
          { class: "rv-body" },
          h("p", { class: "meta" }, posLabel(card)),
          h("p", { class: "cloze" }, ctx.s.slice(0, ctx.a), h("mark", null, expected), ctx.s.slice(ctx.b)),
          fb,
          h("div", { style: { marginTop: "6px" } }, h("h2", { class: "hw" }, card.w), (card.ru ? h("p", { class: "ru" }, card.ru) : card.rm && h("p", { class: "ru auto" }, card.rm)), card.en && h("p", { class: "def" }, card.en), h("p", { class: "meta lvl-line" }, levelBar(res.after, res.after > res.before))),
        ),
        nextBtn(),
      );
      focusNext();
      if (app.settings.speakOnTap) speak(ctx.s);
    }
  }

  const focusNext = () => setTimeout(() => view.querySelector(".rv-foot .btn")?.focus(), 30);

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
    if (!session) home();
  });
  home();
  return () => {
    off();
    document.body.classList.remove("immersive");
  };
}
