// tasks.js — экраны заданий повторения. Каждое задание показывает вопрос, принимает ответ и сообщает результат
// в env.record(). Какое задание дать слову, решает modes.js; здесь только то, как оно выглядит.
//
// env: { view, frame(card, body, foot), record(card, result, task, ctxText, extra), next() } из review.js.
// extra: { ms, len } — сколько длился ответ и сколько букв в верном ответе (для скрытого правила скорости, js/pace.js).
import { h, icon } from "../dom.js";
import { app, posLabel, setMnemonic, setSkip } from "../store.js";
import { isLeech } from "../levels.js";
import { levelBar } from "./level.js";
import { speak, canSpeak } from "../tts.js";
import { buildChoices, buildWordChoices, optionText, promptText } from "../choices.js";
import { pickContext, contextPool } from "../context.js";
import { hintMask, maxHints, maskWord } from "../hints.js";
import { judge, judgeCloze } from "../judge.js";
import { FALLBACK, isLenient } from "../modes.js";
import { formQuestion, inflectedContexts } from "../forms.js";
import { phraseQuestion, canAskPhrase } from "../phrases.js";
import { compareDictation, dictationPool, pickDictation } from "../dictation.js";
import { tokenize } from "../lex.js";

// Часы ответа. Если приложение сворачивали, пока задание было на экране, время не считается (оно ничего не говорит о памяти).
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => document.hidden && (hiddenAt = performance.now()));
const startClock = () => {
  const t0 = performance.now();
  return () => (hiddenAt > t0 ? null : performance.now() - t0);
};

const pickRandom = (list, last, rnd = Math.random) => {
  const fresh = list.length > 1 ? list.filter((c) => c.s !== last) : list;
  return fresh[Math.floor(rnd() * fresh.length) % fresh.length];
};

export function createTasks(env) {
  const { view, frame, record } = env;

  // ── общие части ─────────────────────────────────────────────────────────
  const nextBtn = () => h("button", { class: "btn primary block", onClick: env.next }, "Дальше");
  const focusNext = () => setTimeout(() => view.querySelector(".rv-foot .btn")?.focus(), 30);
  const meaning = (card) => (card.ru ? h("p", { class: "ru" }, card.ru) : card.rm && h("p", { class: "ru auto" }, card.rm));
  const sourceOf = (ctx) => (ctx && !ctx.example ? [ctx.book, ctx.ch].filter(Boolean).join(", ") : "");

  function headword(card, big = true, lv = card.srs.lv, gained = false) {
    return h(
      "div",
      { class: "slip-head", style: { borderBottom: "0", paddingBottom: "0" } },
      h("div", null, h("h2", { class: big ? "rv-hw" : "hw" }, card.w), h("p", { class: "meta" }, posLabel(card)), h("p", { class: "meta lvl-line" }, levelBar(lv, gained))),
      canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(card.w) }, icon("speaker", 24)),
    );
  }

  /** Слово, перевод, определение и пример: показывается после ответа там, где слово до этого не называлось. */
  function revealCard(card, res) {
    return h("div", { class: "reveal" }, headword(card, false, res.after, res.after > res.before), meaning(card), card.en && h("p", { class: "def" }, card.en), card.ex && h("p", { class: "exl" }, h("small", null, "Пример"), card.ex));
  }

  function quote(card) {
    const ctx = card.ctx?.[0];
    if (!ctx) return null;
    return [
      h("blockquote", { class: "cite" }, ctx.s.slice(0, ctx.a), h("mark", null, ctx.s.slice(ctx.a, ctx.b)), ctx.s.slice(ctx.b)),
      h("p", { class: "src" }, [ctx.book, ctx.ch].filter(Boolean).join(", ")),
    ];
  }

  /** Предложение с пропуском. */
  const blanked = (ctx, wide) => h("p", { class: "cloze" }, ctx.s.slice(0, ctx.a), h("span", { class: `blank${wide ? " wide" : ""}`, "aria-label": "пропуск" }), ctx.s.slice(ctx.b));
  const filled = (ctx) => [ctx.s.slice(0, ctx.a), h("mark", null, ctx.s.slice(ctx.a, ctx.b)), ctx.s.slice(ctx.b)];

  const sayWord = (card) => app.settings.speakOnTap && speak(card.w);

  /** Строка обратной связи после письменного ответа. */
  function feedback(verdict, value, correct, what = "Правильно: ") {
    if (verdict === "ok") return h("div", { class: "fb ok" }, "Верно");
    if (verdict === "near") return h("div", { class: "fb no" }, `Почти. ${what}`, h("span", { class: "was" }, correct));
    return h("div", { class: "fb no" }, value.trim() ? `Не совпало. ${what}` : what.replace(/^Правильно/, "Правильный ответ"), h("span", { class: "was" }, correct));
  }

  const field = (placeholder, label, submit) => {
    const input = h("input", { class: "field en", type: "text", placeholder, autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "done", "aria-label": label });
    input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
    return input;
  };

  /** Ступенчатая подсказка: каждое нажатие открывает ещё одну букву (не больше половины слова). */
  function hintLadder(card, input) {
    const max = maxHints(card.w);
    let used = 0;
    const line = h("p", { class: "hintmask", "aria-live": "polite" });
    const button = h(
      "button",
      {
        class: "linkbtn",
        onClick: () => {
          used += 1;
          line.textContent = hintMask(card.w, used);
          if (used >= max) button.remove();
          input.focus();
        },
      },
      "Подсказка",
    );
    return { line, button, used: () => used };
  }

  function listenControls(card) {
    return h(
      "div",
      { class: "listen" },
      h("button", { class: "listen-btn", "aria-label": "Прослушать ещё раз", onClick: () => speak(card.w) }, icon("speaker", 34)),
      h("button", { class: "btn quiet", onClick: () => speak(card.w, { rate: 0.55 }) }, "Медленнее"),
    );
  }

  // ── после ответа ────────────────────────────────────────────────────────
  /**
   * То, что можно сделать с карточкой, пока она на экране: записать свою ассоциацию (для трудных слов предлагается сразу)
   * и отметить имя, которое повторять не нужно. Ничего из этого не меняет уровни.
   */
  function trailer(card) {
    const box = h("div", { class: "trail" });
    let editing = false;
    let skipped = !!card.skip;

    const saveMnemonic = async (input) => {
      await setMnemonic(card.id, input.value);
      editing = false;
      paint();
    };

    function paint() {
      box.replaceChildren();
      if (editing) {
        const input = h("input", { class: "field", type: "text", placeholder: "Образ или созвучие, которое поможет запомнить", value: card.mnemonic || "", autocomplete: "off", "aria-label": "Моя ассоциация", enterkeyhint: "done" });
        input.addEventListener("keydown", (e) => e.key === "Enter" && saveMnemonic(input));
        box.append(h("div", { class: "answer" }, input, h("button", { class: "btn primary", onClick: () => saveMnemonic(input) }, "Сохранить")));
        setTimeout(() => input.focus(), 30);
      } else if (card.mnemonic) {
        box.append(h("p", { class: "mnemo" }, h("small", null, "Моя ассоциация"), card.mnemonic, " ", h("button", { class: "linkbtn inline", onClick: () => ((editing = true), paint()) }, "изменить")));
      } else if (isLeech(card.srs)) {
        box.append(h("button", { class: "linkbtn", onClick: () => ((editing = true), paint()) }, "Придумать ассоциацию"));
      }
      if (/^\p{Lu}/u.test(card.w)) {
        box.append(
          skipped
            ? h("p", { class: "note tight" }, "Больше не повторяется. ", h("button", { class: "linkbtn inline", onClick: async () => (await setSkip(card.id, false), (skipped = false), paint()) }, "Отменить"))
            : h("button", { class: "linkbtn", onClick: async () => (await setSkip(card.id, true), (skipped = true), paint()) }, "Это имя, не повторять"),
        );
      }
    }
    paint();
    return box;
  }

  // ── выбор из вариантов ──────────────────────────────────────────────────
  /**
   * Общий экран «выбрать вариант»: head — вопрос, options — [{text, ok}], reveal(after, res, chosen) дописывает то, что нужно
   * показать после ответа. «Не знаю» засчитывается как ошибка, но не заставляет гадать. В «мягких» заданиях (modes.js, LENIENT)
   * неверный выбор считается «почти», потому что подойти могли бы и другие варианты; сбрасывает уровень только «Не знаю».
   */
  function pickScreen({ card, task, head, prompt, options, word = false, ctxText = "", reveal }) {
    let answered = false;
    const clock = startClock();
    const list = h(
      "div",
      { class: "choices", role: "group", "aria-label": prompt },
      options.map((o) => h("button", { class: `opt${word ? " word" : ""}`, onClick: () => pick(o) }, h("span", { class: "t" }, o.text))),
    );
    const ask = h("p", { class: "rv-hint" }, prompt);
    const after = h("div", { class: "rv-after" });
    const idk = h("button", { class: "linkbtn idk", onClick: () => pick(null) }, "Не знаю");
    frame(card, h("div", { class: "rv-body choose" }, head, ask, after, list, idk), null);

    async function pick(chosen) {
      if (answered) return;
      answered = true;
      const ms = clock();
      list.classList.add("locked");
      ask.remove();
      idk.remove();
      const result = chosen?.ok ? "ok" : chosen && isLenient(task) ? "near" : "no";
      const res = await record(card, result, task, ctxText, { ms });
      [...list.children].forEach((b, i) => {
        const o = options[i];
        b.classList.add(o.ok ? "right" : o === chosen ? "wrong" : "dim");
        if (o.ok || o === chosen) b.append(icon(o.ok ? "check" : "close", 20));
      });
      view.querySelector(".lvl-line")?.replaceChildren(levelBar(res.after, res.after > res.before));
      reveal?.(after, res, chosen);
      after.append(trailer(card));
      view.querySelector(".rv-foot").append(nextBtn());
      focusNext();
      sayWord(card);
    }
    return true;
  }

  // Слово (и фраза из книги) и четыре перевода
  function choice(card, task) {
    const built = buildChoices(card, app.glossary, app.cards);
    if (!built || built.options.length < 3) return false; // в словаре не нашлось, из чего выбирать
    const { options, kind } = built;
    const q = quote(card);
    return pickScreen({
      card,
      task,
      head: h("div", null, headword(card), q && h("div", { class: "rv-ctx" }, q)),
      prompt: kind === "en" ? "Выберите определение" : "Выберите перевод",
      options,
      reveal(after) {
        // Если вариант на кнопке обрезан, полный текст показываем под вопросом
        const full = card[kind];
        if (full && optionText(card, kind) !== full) after.append(h("p", { class: kind === "ru" ? "ru" : "ru auto" }, full));
        if (kind !== "en" && card.en) after.append(h("p", { class: "def" }, card.en));
        if (card.ex) after.append(h("p", { class: "exl" }, h("small", null, "Пример"), card.ex));
      },
    });
  }

  // Перевод и четыре английских слова
  function choiceBack(card, task) {
    const built = buildWordChoices(card, app.glossary, app.cards);
    if (!built || built.options.length < 3) return false;
    const text = promptText(card);
    if (!text) return false;
    const kind = card.ru ? "ru" : card.rm ? "rm" : "en";
    const def = kind === "en" ? null : card.en && maskWord(card.en, card.w).text;
    const head = h("div", { class: "rv-q" }, h("p", { class: "meta" }, posLabel(card)), kind === "en" ? h("p", { class: "def big" }, maskWord(text, card.w).text) : h("p", { class: `ru big${kind === "rm" ? " auto" : ""}` }, text), def && h("p", { class: "def" }, def));
    return pickScreen({
      card,
      task,
      head,
      prompt: "Какое это слово?",
      options: built.options,
      word: true,
      reveal(after, res) {
        head.hidden = true; // перевод и определение покажет карточка ниже, повторять их не нужно
        after.append(revealCard(card, res));
      },
    });
  }

  // Предложение с пропуском и четыре слова
  function clozeChoice(card, task) {
    const ctx = pickContext(card, { glossary: app.glossary, last: card.lastCtx, exact: true });
    if (!ctx) return false;
    const built = buildWordChoices(card, app.glossary, app.cards);
    if (!built || built.options.length < 3) return false;
    const sentence = blanked(ctx, /\s/.test(card.w));
    const hint = card.ru || card.rm || card.en;
    return pickScreen({
      card,
      task,
      ctxText: ctx.s,
      head: h("div", { class: "rv-q" }, h("p", { class: "meta" }, posLabel(card)), sentence, hint && h("p", { class: "rv-hint" }, `Подсказка: ${hint.split(";")[0]}`)),
      prompt: "Какое слово подходит?",
      options: built.options,
      word: true,
      reveal(after, res) {
        sentence.replaceChildren(...filled(ctx));
        const src = sourceOf(ctx);
        if (src) after.append(h("p", { class: "src" }, src));
        after.append(revealCard(card, res));
      },
    });
  }

  // Слово на слух и четыре перевода
  function listenChoice(card, task) {
    if (!canSpeak()) return false;
    const built = buildChoices(card, app.glossary, app.cards);
    if (!built || built.options.length < 3) return false;
    const { options, kind } = built;
    const done = pickScreen({
      card,
      task,
      head: h("div", { class: "rv-q" }, h("p", { class: "meta" }, posLabel(card)), listenControls(card)),
      prompt: kind === "en" ? "Выберите определение услышанного слова" : "Выберите перевод услышанного слова",
      options,
      reveal(after, res) {
        const full = card[kind];
        after.append(revealCard(card, res));
        if (full && optionText(card, kind) !== full) after.append(h("p", { class: "src" }, full));
      },
    });
    speak(card.w); // вызывается из нажатия кнопки, поэтому iOS разрешает звук
    return done;
  }

  // Предложение с пропуском и четыре формы слова (grew, grown, growing): в книге верна одна, но подойти могла и другая
  function formChoice(card, task) {
    const pool = inflectedContexts(contextPool(card, app.glossary), card);
    if (!pool.length) return false;
    let ctx = null;
    let q = null;
    for (let tries = 0; tries < 4 && !q; tries++) {
      ctx = pickRandom(pool, card.lastCtx);
      q = formQuestion(card, ctx);
    }
    if (!q) return false;
    const sentence = blanked(ctx, false);
    return pickScreen({
      card,
      task,
      ctxText: ctx.s,
      head: h("div", { class: "rv-q" }, h("p", { class: "meta" }, posLabel(card)), sentence),
      prompt: `Выберите форму слова ${card.w}`,
      options: q.options,
      word: true,
      reveal(after, res, chosen) {
        sentence.replaceChildren(...filled(ctx));
        if (chosen && !chosen.ok) after.append(h("p", { class: "note tight" }, `В книге здесь ${q.answer}. Другая форма тоже могла подойти, поэтому уровень за этот ответ не снижен.`));
        const src = sourceOf(ctx);
        if (src) after.append(h("p", { class: "src" }, src));
        after.append(revealCard(card, res));
      },
    });
  }

  // Фразовый глагол или идиома: нужно выбрать пропущенную частицу или слово, перевод фразы подсказан
  function phraseChoice(card, task) {
    const hint = card.ru || card.rm || card.en;
    if (!hint) return false;
    const ctx = card.t === "pv" ? pickContext(card, { glossary: app.glossary, last: card.lastCtx }) : null;
    const q = phraseQuestion({ card, entries: app.glossary.list, ctx });
    if (!q) return false;
    const sentence = h("p", { class: "cloze" }, q.before, h("span", { class: "blank", "aria-label": "пропуск" }), q.after);
    return pickScreen({
      card,
      task,
      ctxText: q.sentence ? ctx.s : "",
      head: h("div", { class: "rv-q" }, h("p", { class: "meta" }, posLabel(card)), sentence, h("p", { class: "rv-hint" }, `Подсказка: ${hint.split(";")[0]}`)),
      prompt: q.kind === "pv" ? "Какая частица?" : "Какое слово пропущено?",
      options: q.options,
      word: true,
      reveal(after, res) {
        sentence.replaceChildren(q.before, h("mark", null, q.answer), q.after);
        const src = q.sentence ? sourceOf(ctx) : "";
        if (src) after.append(h("p", { class: "src" }, src));
        after.append(revealCard(card, res));
      },
    });
  }

  // ── письменные задания ──────────────────────────────────────────────────
  // Написание: перевод (и определение без самого слова), нужно написать слово
  function spell(card, task) {
    const clock = startClock();
    const submit = () => finish(input.value);
    const input = field("По-английски", "Ответ", submit);
    const ladder = hintLadder(card, input);
    const first = card.ru || card.rm;
    const def = card.en ? maskWord(card.en, card.w).text : "";
    frame(
      card,
      h(
        "div",
        { class: "rv-body" },
        h("p", { class: "meta" }, posLabel(card)),
        first ? h("p", { class: `ru big${card.ru ? "" : " auto"}` }, first) : def ? h("p", { class: "def big" }, def) : h("p", { class: "ru big auto" }, "Слово без перевода"),
        first && def && h("p", { class: "def" }, def),
        ladder.line,
        h("div", { class: "answer" }, input, h("button", { class: "btn primary", onClick: submit }, "Проверить")),
        h("div", { style: { display: "flex", gap: "20px" } }, ladder.button, h("button", { class: "linkbtn", onClick: () => finish("") }, "Не помню")),
      ),
      null,
    );
    setTimeout(() => input.focus(), 60);

    async function finish(value) {
      const ms = clock();
      const verdict = judge(value, card.w);
      // верно, но с подсказкой, и «почти»: уровень остаётся прежним
      const result = verdict === "ok" ? (ladder.used() ? "near" : "ok") : verdict;
      const res = await record(card, result, task, "", { ms, len: card.w.length });
      writtenReveal(card, res, feedback(verdict, value, card.w));
    }
    return true;
  }

  /** Экран после письменного ответа в заданиях, где слово называлось только в ответе. */
  function writtenReveal(card, res, fb) {
    frame(card, h("div", { class: "rv-body" }, headwordBlock(card, res), fb, h("div", { style: { marginTop: "6px" } }, answerBlock(card)), trailer(card)), nextBtn());
    focusNext();
    sayWord(card);
  }
  const headwordBlock = (card, res) => headword(card, false, res.after, res.after > res.before);
  const answerBlock = (card) => [meaning(card), card.en && h("p", { class: "def" }, card.en), quote(card), card.ex && h("p", { class: "exl" }, h("small", null, "Пример"), card.ex)];

  // Слово в предложении: впишите слово. Если в предложении другая форма, а вы вписали начальную, второй шаг просит форму.
  function cloze(card, task) {
    const ctx = pickContext(card, { glossary: app.glossary, last: card.lastCtx });
    if (!ctx) return false;
    const expected = ctx.s.slice(ctx.a, ctx.b);
    const hint = card.ru || card.rm || card.en;
    const wide = /\s/.test(expected);

    let ms = null;
    function ask() {
      const clock = startClock();
      const submit = () => ((ms = clock()), step1(input.value));
      const input = field("Слово", "Пропущенное слово", submit);
      frame(
        card,
        h(
          "div",
          { class: "rv-body" },
          h("p", { class: "meta" }, posLabel(card)),
          blanked(ctx, wide),
          h("p", { class: "rv-hint" }, `Подсказка: ${hint}`),
          h("div", { class: "answer" }, input, h("button", { class: "btn primary", onClick: submit }, "Проверить")),
          h("div", null, h("button", { class: "linkbtn", onClick: () => ((ms = clock()), done("no", "")) }, "Не помню")),
        ),
        null,
      );
      setTimeout(() => input.focus(), 60);
    }

    function step1(value) {
      const { verdict, base } = judgeCloze(value, expected, card.w);
      if (base) return askForm();
      return done(verdict, value);
    }

    function askForm() {
      const submit = () => done(judge(input.value, expected) === "ok" ? "ok" : "near", input.value, true);
      const input = field("Нужная форма", "Форма слова в предложении", submit);
      frame(
        card,
        h(
          "div",
          { class: "rv-body" },
          h("p", { class: "meta" }, posLabel(card)),
          blanked(ctx, wide),
          h("div", { class: "fb ok" }, "Слово верное. В предложении оно в другой форме, впишите её"),
          h("div", { class: "answer" }, input, h("button", { class: "btn primary", onClick: submit }, "Проверить")),
          h("div", null, h("button", { class: "linkbtn", onClick: () => done("near", "", true) }, "Не знаю форму")),
        ),
        null,
      );
      setTimeout(() => input.focus(), 60);
    }

    async function done(verdict, value, form = false) {
      const res = await record(card, verdict, task, ctx.s, { ms, len: expected.length });
      const fb = form && verdict === "near" ? h("div", { class: "fb no" }, "Слово верное, но форма другая. В предложении: ", h("span", { class: "was" }, expected)) : feedback(verdict, value, expected, "В предложении: ");
      const src = sourceOf(ctx);
      frame(
        card,
        h(
          "div",
          { class: "rv-body" },
          h("p", { class: "meta" }, posLabel(card)),
          h("p", { class: "cloze" }, ...filled(ctx)),
          src && h("p", { class: "src" }, src),
          fb,
          h("div", { style: { marginTop: "6px" } }, h("h2", { class: "hw" }, card.w), meaning(card), card.en && h("p", { class: "def" }, card.en), h("p", { class: "meta lvl-line" }, levelBar(res.after, res.after > res.before))),
          trailer(card),
        ),
        nextBtn(),
      );
      focusNext();
      if (app.settings.speakOnTap) speak(ctx.s);
    }

    ask();
    return true;
  }

  // Слух: слово звучит, нужно написать
  function listenType(card, task) {
    if (!canSpeak()) return false;
    const clock = startClock();
    const submit = () => finish(input.value);
    const input = field("По-английски", "Что вы услышали", submit);
    const ladder = hintLadder(card, input);
    frame(
      card,
      h(
        "div",
        { class: "rv-body" },
        h("p", { class: "meta" }, posLabel(card)),
        listenControls(card),
        h("p", { class: "rv-hint" }, "Напишите услышанное слово"),
        ladder.line,
        h("div", { class: "answer" }, input, h("button", { class: "btn primary", onClick: submit }, "Проверить")),
        h("div", { style: { display: "flex", gap: "20px" } }, ladder.button, h("button", { class: "linkbtn", onClick: () => finish("") }, "Не помню")),
      ),
      null,
    );
    speak(card.w);

    async function finish(value) {
      const ms = clock();
      const verdict = judge(value, card.w);
      const result = verdict === "ok" ? (ladder.used() ? "near" : "ok") : verdict;
      const res = await record(card, result, task, "", { ms, len: card.w.length });
      writtenReveal(card, res, feedback(verdict, value, card.w));
    }
    return true;
  }

  // Диктант: звучит предложение из книги, его нужно записать целиком; потом разбор по словам
  function dictation(card, task) {
    if (!canSpeak()) return false;
    const ctx = pickDictation(contextPool(card, app.glossary), { last: card.lastCtx });
    if (!ctx) return false;
    const count = tokenize(ctx.s).length;
    const submit = () => finish(input.value);
    const input = h("textarea", { class: "field en dictation", rows: 3, placeholder: "Запишите предложение", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "done", "aria-label": "Услышанное предложение" });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    frame(
      card,
      h(
        "div",
        { class: "rv-body" },
        h("p", { class: "meta" }, "Диктант"),
        h("div", { class: "listen" }, h("button", { class: "listen-btn", "aria-label": "Прослушать ещё раз", onClick: () => speak(ctx.s) }, icon("speaker", 34)), h("button", { class: "btn quiet", onClick: () => speak(ctx.s, { rate: 0.55 }) }, "Медленнее")),
        h("p", { class: "rv-hint" }, `Запишите предложение. Слов: ${count}`),
        h("div", { class: "answer col" }, input, h("button", { class: "btn primary", onClick: submit }, "Проверить")),
        h("div", null, h("button", { class: "linkbtn", onClick: () => finish("") }, "Не расслышал")),
      ),
      null,
    );
    speak(ctx.s); // вызывается из нажатия кнопки, поэтому iOS разрешает звук
    setTimeout(() => input.focus({ preventScroll: true }), 60);

    async function finish(value) {
      const r = compareDictation(value, ctx);
      const res = await record(card, r.verdict, task, ctx.s);
      const fb = r.verdict === "ok" ? h("div", { class: "fb ok" }, "Верно") : h("div", { class: "fb no" }, r.verdict === "near" ? "Почти. " : value.trim() ? "Не совпало. " : "Правильное предложение. ", r.n ? `Верных слов: ${r.exact} из ${r.n}` : "");
      const src = sourceOf(ctx);
      frame(
        card,
        h(
          "div",
          { class: "rv-body" },
          h("p", { class: "meta" }, "Диктант"),
          fb,
          h("p", { class: "dict-diff" }, r.lead, r.parts.map(diffPart)),
          r.verdict !== "ok" && r.parts.some((p) => p.kind !== "ok") && h("p", { class: "note tight" }, "Зачёркнуто то, что вы написали, подчёркнуто верное слово."),
          src && h("p", { class: "src" }, src),
          h("button", { class: "linkbtn", onClick: () => speak(ctx.s) }, icon("speaker", 15), "Послушать ещё раз"),
          h("div", { style: { marginTop: "10px" } }, headwordBlock(card, res), meaning(card), card.en && h("p", { class: "def" }, card.en)),
          trailer(card),
        ),
        nextBtn(),
      );
      focusNext();
    }
    return true;
  }

  /** Одно слово разбора диктанта. */
  function diffPart(p) {
    const mark = p.key ? " key" : "";
    switch (p.kind) {
      case "ok":
        return [h("span", { class: `dw ok${mark}` }, p.word), p.tail];
      case "typo":
        return [h("span", { class: `dw typo${mark}` }, h("del", null, p.typed), " ", h("ins", null, p.word)), p.tail];
      case "wrong":
        return [h("span", { class: `dw wrong${mark}` }, h("del", null, p.typed), " ", h("ins", null, p.word)), p.tail];
      case "miss":
        return [h("span", { class: `dw miss${mark}` }, h("ins", null, p.word)), p.tail];
      default:
        return [h("span", { class: "dw extra" }, h("del", null, p.typed)), " "];
    }
  }

  const impl = { choice, choiceBack, clozeChoice, formChoice, phraseChoice, listenChoice, spell, cloze, listenType, dictation };

  return {
    /** Возможно ли задание для этой карточки на этом устройстве (есть ли предложение, озвучка). */
    can(card, task) {
      if (task === "listenChoice" || task === "listenType") return canSpeak();
      if (task === "cloze") return contextPool(card, app.glossary).length > 0;
      if (task === "clozeChoice") return contextPool(card, app.glossary, { exact: true }).length > 0;
      if (task === "formChoice") return inflectedContexts(contextPool(card, app.glossary), card).length > 0;
      if (task === "phraseChoice") return canAskPhrase(card) && !!(card.ru || card.rm || card.en) && !!phraseQuestion({ card, entries: app.glossary.list });
      if (task === "dictation") return canSpeak() && dictationPool(contextPool(card, app.glossary)).length > 0;
      return true;
    },
    /** Показывает задание. Если его не удалось построить, берёт запасное (modes.js, FALLBACK). */
    run(task, card) {
      for (let t = task; t; t = FALLBACK[t]) if (impl[t](card, t) !== false) return;
      spell(card, "spell"); // спрашивать больше нечего; написание строится всегда
    },
  };
}
