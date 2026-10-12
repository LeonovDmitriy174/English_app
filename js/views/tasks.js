// tasks.js — экраны заданий повторения. Каждое задание показывает вопрос, принимает ответ и сообщает результат
// в env.record(). Какое задание дать слову, решает modes.js; здесь только то, как оно выглядит.
//
// env: { view, frame(card, body, foot), record(card, result, task, ctxText), next() } из review.js.
import { h, icon } from "../dom.js";
import { app, posLabel } from "../store.js";
import { levelBar } from "./level.js";
import { speak, canSpeak } from "../tts.js";
import { buildChoices, buildWordChoices, optionText, promptText } from "../choices.js";
import { pickContext, contextPool } from "../context.js";
import { hintMask, maxHints, maskWord } from "../hints.js";
import { judge, judgeCloze } from "../judge.js";
import { FALLBACK } from "../modes.js";

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

  // ── выбор из вариантов ──────────────────────────────────────────────────
  /**
   * Общий экран «выбрать вариант»: head — вопрос, options — [{text, ok}], reveal(after, res) дописывает то, что нужно
   * показать после ответа. «Не знаю» засчитывается как ошибка, но не заставляет гадать.
   */
  function pickScreen({ card, task, head, prompt, options, word = false, ctxText = "", reveal }) {
    let answered = false;
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
      list.classList.add("locked");
      ask.remove();
      idk.remove();
      const res = await record(card, chosen?.ok ? "ok" : "no", task, ctxText);
      [...list.children].forEach((b, i) => {
        const o = options[i];
        b.classList.add(o.ok ? "right" : o === chosen ? "wrong" : "dim");
        if (o.ok || o === chosen) b.append(icon(o.ok ? "check" : "close", 20));
      });
      view.querySelector(".lvl-line")?.replaceChildren(levelBar(res.after, res.after > res.before));
      reveal?.(after, res);
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
    return pickScreen({
      card,
      task,
      head: h("div", { class: "rv-q" }, h("p", { class: "meta" }, posLabel(card)), kind === "en" ? h("p", { class: "def big" }, maskWord(text, card.w).text) : h("p", { class: `ru big${kind === "rm" ? " auto" : ""}` }, text), def && h("p", { class: "def" }, def)),
      prompt: "Какое это слово?",
      options: built.options,
      word: true,
      reveal: (after, res) => after.append(revealCard(card, res)),
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

  // ── письменные задания ──────────────────────────────────────────────────
  // Написание: перевод (и определение без самого слова), нужно написать слово
  function spell(card, task) {
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
      const verdict = judge(value, card.w);
      // верно, но с подсказкой, и «почти»: уровень остаётся прежним
      const result = verdict === "ok" ? (ladder.used() ? "near" : "ok") : verdict;
      const res = await record(card, result, task);
      writtenReveal(card, res, feedback(verdict, value, card.w));
    }
    return true;
  }

  /** Экран после письменного ответа в заданиях, где слово называлось только в ответе. */
  function writtenReveal(card, res, fb) {
    frame(card, h("div", { class: "rv-body" }, headwordBlock(card, res), fb, h("div", { style: { marginTop: "6px" } }, answerBlock(card))), nextBtn());
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

    function ask() {
      const submit = () => step1(input.value);
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
          h("div", null, h("button", { class: "linkbtn", onClick: () => done("no", "") }, "Не помню")),
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
      const res = await record(card, verdict, task, ctx.s);
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
      const verdict = judge(value, card.w);
      const result = verdict === "ok" ? (ladder.used() ? "near" : "ok") : verdict;
      const res = await record(card, result, task);
      writtenReveal(card, res, feedback(verdict, value, card.w));
    }
    return true;
  }

  const impl = { choice, choiceBack, clozeChoice, listenChoice, spell, cloze, listenType };

  return {
    /** Возможно ли задание для этой карточки на этом устройстве (есть ли предложение, озвучка). */
    can(card, task) {
      if (task === "listenChoice" || task === "listenType") return canSpeak();
      if (task === "cloze") return contextPool(card, app.glossary).length > 0;
      if (task === "clozeChoice") return contextPool(card, app.glossary, { exact: true }).length > 0;
      return true;
    },
    /** Показывает задание. Если его не удалось построить, берёт запасное (modes.js, FALLBACK). */
    run(task, card) {
      for (let t = task; t; t = FALLBACK[t]) if (impl[t](card, t) !== false) return;
      spell(card, "spell"); // спрашивать больше нечего; написание строится всегда
    },
  };
}
