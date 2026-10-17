// replenish.js — «Пополнить словарь»: стартовый экран (где остановились, тысячи и тесты), проверка слов по частоте и итоги.
// Правила (что добавляется, что оставляется, как сдаётся тест) в js/freqdeck.js, запись в словарь в js/store/replenish.js.
import { h, icon, toast, openSheet } from "../dom.js";
import { app, dictionaryReady, loadFreqState, saveFreqState, loadFreqFile, loadOwnList, saveOwnList, clearOwnList, replenishAnswer, posLabel } from "../store.js";
import { buildChoices, optionText } from "../choices.js";
import { speak, canSpeak } from "../tts.js";
import { levelBar } from "./level.js";
import { MIN_LIST, EXAM_SIZE, PASS_SHARE, buildRanking, overview, startRank, placeInList, markChecked, pickExam, recordExam, examVerdict, blockOf, blockRange, parseOwnList } from "../freqdeck.js";

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};
const words = (n) => `${n} ${plural(n, ["слово", "слова", "слов"])}`;
const pct = (share) => `${Math.round(share * 100)}%`;
const CORRECT_PAUSE = 650; // после верного ответа следующее слово появляется само; после ошибки ждём «Дальше»
const MIN_OWN_WORDS = 50;
const MAX_OWN_BYTES = 5 * 1024 * 1024;

export function renderReplenish(root) {
  const view = h("main", { class: "view" });
  root.replaceChildren(view);
  let alive = true;
  let state = null; // где остановилась проверка и сданные тесты
  let ranking = { source: "dict", items: [] };
  let own = null; // свой список слов
  let file = { words: [] };
  let run = null; // идущая проверка или тест
  let timer = 0;

  const items = () => ranking.items;
  const total = () => ranking.items.length;

  async function load() {
    view.replaceChildren(h("div", { class: "page" }, h("header", { class: "top" }, h("h1", { class: "title" }, "Пополнить словарь")), h("p", { class: "note" }, "Загружаю словарь…")));
    [state, own, file] = await Promise.all([loadFreqState(), loadOwnList(), loadFreqFile()]);
    await dictionaryReady();
    if (!alive) return;
    rank();
    home();
  }

  /** Собирает список слов и ставит отметку на то место, где вы остановились (список мог измениться). */
  function rank() {
    ranking = buildRanking({ glossary: app.glossary, own, file });
    const place = placeInList(state, ranking.items);
    if (place !== state.done) {
      state.done = place;
      state.last = place ? ranking.items[place - 1].w : "";
      saveFreqState();
    }
  }

  // ── стартовый экран ─────────────────────────────────────────────────────
  function home() {
    clearTimeout(timer);
    run = null;
    view.className = "view";
    document.body.classList.remove("immersive");
    const page = h("div", { class: "page" }, h("header", { class: "top" }, h("div", null, h("h1", { class: "title" }, "Пополнить словарь")), h("div", { class: "top-actions" }, h("button", { class: "iconbtn", "aria-label": "К словарю", onClick: () => (location.hash = "#/dict") }, icon("close", 24)))));
    view.replaceChildren(page);

    if (app.dict.state === "error") return page.append(h("p", { class: "note err" }, "Словарь не загрузился, проверять нечего. Откройте любой другой раздел и вернитесь, когда словарь загрузится."));
    if (total() < MIN_LIST) return page.append(emptyList());

    const o = overview(state, total());
    // page.append — родной метод DOM: ложные значения он печатает как текст, поэтому лишнее отсеиваем сами
    const parts = [
      h("p", { class: "lead" }, o.done ? `Проверено ${o.done} из ${total()}` : "Слова по частоте"),
      h("p", { class: "sub" }, "От самых частых слов к более редким. Выберите верный перевод: слово, которое вы знаете, добавится в словарь как знакомое, а незнакомое как новое. Закончить можно в любой момент."),
      o.mastered && h("p", { class: "rp-done" }, icon("check", 20), "Весь список пройден, все тесты сданы"),
      h(
        "div",
        { class: "start-row", style: { marginTop: "20px" } },
        h("button", { class: "btn primary grow", onClick: () => startSeries(o.finished ? 1 : o.next) }, o.finished ? "Пройти заново" : o.done ? `Продолжить с ${o.next}-го слова` : "Начать"),
      ),
      h("div", { class: "rp-blocks" }, o.blocks.map(blockRow)),
      h("p", { class: "note tight" }, sourceNote(), " ", h("button", { class: "linkbtn inline", onClick: openOwnList }, own ? "Свой список" : "Загрузить свой список")),
    ];
    page.append(...parts.filter(Boolean));
  }

  function emptyList() {
    return h(
      "section",
      { class: "empty" },
      h("p", { class: "lead" }, "Пока нет слов для проверки"),
      h("p", null, "Частотный список строится по словарю приложения, а в нём слишком мало слов с переводом. Соберите полный словарь (README, раздел «Словарь»), и здесь появятся пять тысяч самых частых слов."),
      h("button", { class: "btn", onClick: openOwnList }, "Загрузить свой список"),
    );
  }

  function sourceNote() {
    if (ranking.source === "own") return `Список: ваш${own?.name ? ` («${own.name}»)` : ""}.`;
    if (ranking.source === "file") return "Список составлен по частоте слов в английских текстах.";
    return "Порядок приблизительный (по частоте слов в словаре). Точный список: npm run freq.";
  }

  function blockRow(b) {
    const t = b.test;
    const status = t?.pass ? h("span", { class: "rp-st ok" }, icon("check", 16), `тест сдан: ${pct(t.best)}`) : b.complete ? h("span", { class: "rp-st" }, t ? `тест: ${pct(t.best)}, нужно ${pct(PASS_SHARE)}` : "проверена, можно сдать тест") : h("span", { class: "rp-st" }, b.checked ? `проверено ${b.checked} из ${b.size}` : "ещё не проверена");
    return h(
      "div",
      { class: "rp-block" },
      h("div", { class: "rp-bh" }, h("b", null, `${b.from}–${b.to}`), status),
      h("div", { class: "rp-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": b.size, "aria-valuenow": b.checked }, h("i", { style: { width: `${(b.checked / b.size) * 100}%` } })),
      t && !t.pass && b.complete && h("p", { class: "note tight" }, "Повторите слова этой тысячи в «Повторении» и пересдайте тест: ничего не откатывается."),
      b.complete && !t?.pass && h("button", { class: "btn quiet block", onClick: () => startExam(b.k) }, t ? "Пересдать тест" : "Пройти тест"),
    );
  }

  // ── свой список ─────────────────────────────────────────────────────────
  function openOwnList() {
    const fileInput = h("input", { type: "file", accept: ".txt,.csv,.tsv,text/plain,text/csv", class: "visually-hidden", "aria-label": "Файл со списком слов" });
    const choose = h("button", { class: "btn block", onClick: () => fileInput.click() }, own ? "Заменить список" : "Выбрать файл");
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files[0];
      fileInput.value = "";
      if (!f) return;
      if (f.size > MAX_OWN_BYTES) return toast("Файл слишком большой для списка слов");
      choose.disabled = true;
      try {
        const parsed = parseOwnList(await f.text());
        if (parsed.words.length < MIN_OWN_WORDS) return toast("В файле нашлось слишком мало слов");
        await saveOwnList({ words: parsed.words, name: f.name.replace(/\.[^.]+$/, "") });
        own = await loadOwnList();
        sheet.close();
        rank();
        home();
        toast(`Список загружен: ${words(parsed.words.length)}, в словаре нашлось ${total()}`);
      } catch {
        toast("Не удалось прочитать файл");
      } finally {
        choose.disabled = false;
      }
    });
    const drop = own
      ? h(
          "button",
          {
            class: "btn quiet block",
            onClick: async () => {
              await clearOwnList();
              own = null;
              sheet.close();
              rank();
              home();
            },
          },
          "Убрать свой список",
        )
      : null;
    const sheet = openSheet({
      label: "Свой список слов",
      content: h(
        "div",
        null,
        h("h2", { class: "set-title" }, "Свой список слов"),
        h("p", { class: "note tight" }, "Если у вас есть частотный список английских слов (выгрузка с сайта, из книги, из таблицы), загрузите его: проверка пойдёт по нему, а не по списку приложения. Подойдёт текстовый файл или CSV: слово в каждой строке, можно с номером по частоте («112;time»). Предлоги, союзы и другие служебные слова пропускаются сами, как и слова, которых нет в словаре. Список остаётся на устройстве."),
        own ? h("p", { class: "note tight" }, `Сейчас загружен ваш список${own.name ? ` «${own.name}»` : ""}: ${words(own.words.length)}.`) : null,
        h("div", { class: "rp-sheet-actions" }, choose, drop),
        fileInput,
      ),
    });
  }

  // ── проверка ────────────────────────────────────────────────────────────
  function startSeries(from) {
    run = { mode: "series", from, i: 0, stats: { n: 0, ok: 0, add: 0, fresh: 0, drop: 0, keep: 0, skipped: 0 }, block: 0 };
    next();
  }

  function startExam(k) {
    const list = pickExam(items(), k);
    if (!list.length) return;
    run = { mode: "exam", k, list, i: 0, stats: { n: 0, ok: 0, add: 0, fresh: 0, drop: 0, keep: 0, skipped: 0 }, block: 0 };
    next();
  }

  /** Слово, которое спрашивается сейчас: { rank, entry } или null, когда список кончился. */
  function current() {
    if (run.mode === "exam") return run.list[run.i] || null;
    const rank = run.from + run.i;
    return rank <= total() ? { rank, entry: items()[rank - 1] } : null;
  }

  function next() {
    clearTimeout(timer);
    if (run.block) return blockDone(run.block);
    const cur = current();
    if (!cur) return run.mode === "exam" ? examDone() : seriesDone(true);
    const subject = (() => {
      const card = app.cards.get(cur.entry.id);
      return card && (card.ru || card.rm) ? card : cur.entry;
    })();
    const built = buildChoices(subject, app.glossary, app.cards);
    if (!built || built.options.length < 3) {
      // из чего выбирать не нашлось: слово пропускаем, но место в списке отмечаем
      run.stats.skipped += 1;
      return record(cur).then(() => step(cur));
    }
    ask(cur, subject, built);
  }

  /** Рамка экрана проверки: «Закончить», полоска и номер вверху, карточка, кнопка внизу. */
  function frame(body, foot, { share, count }) {
    view.className = "view no-tabs";
    document.body.classList.add("immersive");
    view.replaceChildren(
      h(
        "div",
        { class: "rv-stage" },
        h(
          "div",
          { class: "rv-top" },
          h("button", { class: "rp-end", onClick: () => (run.mode === "exam" ? abandonExam() : seriesDone(false)) }, "Закончить"),
          h("div", { class: "rv-progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(share * 100) }, h("i", { style: { width: `${share * 100}%` } })),
          h("span", { class: "rv-count rp-count" }, count),
        ),
        h("div", { class: "paper k-w" }, body),
        h("div", { class: "rv-foot" }, foot),
      ),
    );
  }

  function ask(cur, subject, built) {
    const { entry, rank } = cur;
    const exam = run.mode === "exam";
    const { options, kind } = built;
    const t0 = performance.now();
    let answered = false;
    let moved = false;
    const go = () => {
      if (moved) return;
      moved = true;
      clearTimeout(timer);
      step(cur);
    };
    const list = h(
      "div",
      { class: "choices", role: "group", "aria-label": "Выберите перевод" },
      options.map((o) => h("button", { class: "opt", onClick: () => pick(o) }, h("span", { class: "t" }, o.text))),
    );
    const prompt = h("p", { class: "rv-hint" }, kind === "en" ? "Выберите определение" : "Выберите перевод");
    const after = h("div", { class: "rv-after" });
    const idk = h("button", { class: "linkbtn idk", onClick: () => pick(null) }, "Не знаю");
    const head = h(
      "div",
      { class: "slip-head", style: { borderBottom: "0", paddingBottom: "0" } },
      h("div", null, h("h2", { class: "rv-hw" }, entry.w), h("p", { class: "meta" }, posLabel(entry))),
      canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(entry.w) }, icon("speaker", 24)),
    );
    const foot = h("div");
    frame(h("div", { class: "rv-body choose" }, head, prompt, after, list, idk), foot, exam ? { share: run.i / run.list.length, count: `${run.i + 1} из ${run.list.length}` } : { share: rank / total(), count: `${rank} / ${total()}` });

    async function pick(chosen) {
      if (answered) return;
      answered = true;
      const ms = performance.now() - t0;
      list.classList.add("locked");
      prompt.remove();
      idk.remove();
      const ok = !!chosen?.ok;
      const res = await replenishAnswer(entry, ok, { ms });
      [...list.children].forEach((b, i) => {
        const o = options[i];
        b.classList.add(o.ok ? "right" : o === chosen ? "wrong" : "dim");
        if (o.ok || o === chosen) b.append(icon(o.ok ? "check" : "close", 20));
      });
      if (app.settings.speakOnTap) speak(entry.w);
      countAnswer(res.kind, ok);
      await record(cur);
      if (ok) {
        // верный ответ: короткая пауза и следующее слово; кнопка «Дальше» позволяет не ждать
        foot.append(h("button", { class: "btn primary block", onClick: go }, "Дальше"));
        timer = setTimeout(go, CORRECT_PAUSE);
        return;
      }
      const full = subject[kind];
      if (full && optionText(subject, kind) !== full) after.append(h("p", { class: kind === "ru" ? "ru" : "ru auto" }, full));
      if (kind !== "en" && entry.en) after.append(h("p", { class: "def" }, entry.en));
      if (entry.ex) after.append(h("p", { class: "exl" }, h("small", null, "Пример"), entry.ex));
      after.append(h("div", { class: "rp-fate" }, fateNote(res)));
      foot.append(h("button", { class: "btn primary block", onClick: go }, "Дальше"));
      setTimeout(() => foot.querySelector(".btn")?.focus(), 30);
    }
  }

  /** Что стало со словом после ошибки: одна строка под ответом. */
  function fateNote(res) {
    if (res.kind === "fresh") return h("p", { class: "note tight" }, "Слово добавлено в словарь как новое.");
    if (res.kind === "drop") return h("p", { class: "note tight rp-lvl" }, "Слово уже в словаре, уровень снижен ", levelBar(res.card.srs.lv));
    return h("p", { class: "note tight" }, "Слово уже в словаре.");
  }

  function countAnswer(kind, ok) {
    const st = run.stats;
    st.n += 1;
    if (ok) st.ok += 1;
    st[kind] += 1;
  }

  /** Запоминает место в списке сразу после ответа: «Закончить» в любой момент не теряет ни одного слова. */
  async function record(cur) {
    if (run.mode !== "series") return;
    markChecked(state, cur.rank, cur.entry.w);
    await saveFreqState();
  }

  /** К следующему слову; если это было последнее слово тысячи, сначала экран тысячи. */
  function step(cur) {
    if (run.mode === "series") {
      const k = blockOf(cur.rank);
      if (cur.rank === blockRange(k, total()).to) run.block = k;
    }
    run.i += 1;
    next();
  }

  function abandonExam() {
    clearTimeout(timer);
    toast("Тест прерван, результат не записан");
    home();
  }

  // ── итоги ───────────────────────────────────────────────────────────────
  function summaryLines(s) {
    return [
      s.add && `Добавлено как знакомые: ${s.add}`,
      s.fresh && `Добавлено как новые: ${s.fresh}`,
      s.drop && `Уровень снижен у слов: ${s.drop}`,
      s.keep && `Уже были в словаре: ${s.keep}`,
    ].filter(Boolean);
  }

  const doneScreen = (children) => {
    view.className = "view";
    document.body.classList.remove("immersive");
    view.replaceChildren(h("div", { class: "page" }, h("section", { class: "done" }, children)));
  };

  function seriesDone(finishedList) {
    clearTimeout(timer);
    const s = run.stats;
    const o = overview(state, total());
    doneScreen([
      h("p", { class: "lead" }, finishedList ? "Список пройден до конца" : s.n ? `Проверено ${words(s.n)}` : "Заходите, когда будет время"),
      s.n ? h("p", { class: "sub" }, `Верных ответов: ${s.ok} из ${s.n}.`) : h("p", { class: "sub" }, "Место в списке сохранено."),
      h("ul", { class: "rp-lines" }, summaryLines(s).map((t) => h("li", null, t))),
      h("div", { class: "start-row", style: { marginTop: "26px", width: "100%" } }, !o.finished && h("button", { class: "btn primary grow", onClick: () => startSeries(o.next) }, `Продолжить с ${o.next}-го`), h("button", { class: o.finished ? "btn primary grow" : "btn quiet", onClick: home }, "Готово")),
    ]);
  }

  /** Тысяча проверена до конца: предложить тест, не заставляя его проходить. */
  function blockDone(k) {
    clearTimeout(timer);
    const r = blockRange(k, total());
    const last = r.to >= total();
    const t = state.tests[k];
    doneScreen([
      h("p", { class: "lead" }, `Слова ${r.from}–${r.to} проверены`),
      h("p", { class: "sub" }, t?.pass ? "Тест по этим словам уже сдан." : `Можно проверить себя: ${EXAM_SIZE} случайных слов из этой тысячи, нужно не меньше ${pct(PASS_SHARE)} верных. Или идти дальше, тест останется доступен на этом экране.`),
      h("div", { class: "start-row rp-stack", style: { marginTop: "26px", width: "100%" } }, !t?.pass && h("button", { class: "btn primary block", onClick: () => ((run.block = 0), startExam(k)) }, "Пройти тест"), !last && h("button", { class: t?.pass ? "btn primary block" : "btn quiet block", onClick: () => ((run.block = 0), next()) }, "Продолжить"), h("button", { class: "linkbtn", onClick: () => seriesDone(false) }, "Закончить")),
    ]);
  }

  async function examDone() {
    const s = run.stats;
    const n = run.list.length;
    recordExam(state, run.k, s.ok, n);
    await saveFreqState();
    const { share, pass } = examVerdict(s.ok, n);
    const o = overview(state, total());
    doneScreen([
      h("p", { class: "lead" }, pass ? "Тест сдан" : "Пока не сдан"),
      h("p", { class: "sub" }, `Верных ответов: ${s.ok} из ${n} (${pct(share)}). Нужно не меньше ${pct(PASS_SHARE)}.`),
      pass
        ? o.mastered
          ? h("p", { class: "rp-done" }, icon("check", 20), "Весь список пройден, все тесты сданы")
          : h("p", { class: "note tight" }, `Тысяча ${run.k} отмечена как пройденная.`)
        : h("p", { class: "note tight" }, "Ничего не откатывается. Слова с ошибками уже вернулись в повторение: повторите их и пересдайте тест, когда будете готовы."),
      h("ul", { class: "rp-lines" }, summaryLines(s).map((t) => h("li", null, t))),
      h("div", { class: "start-row", style: { marginTop: "26px", width: "100%" } }, !pass && h("button", { class: "btn primary grow", onClick: () => startExam(run.k) }, "Пересдать"), h("button", { class: pass ? "btn primary grow" : "btn quiet", onClick: home }, "Готово")),
    ]);
  }

  load();
  return () => {
    alive = false;
    clearTimeout(timer);
    document.body.classList.remove("immersive");
  };
}

