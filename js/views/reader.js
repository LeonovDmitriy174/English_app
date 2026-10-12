// reader.js — читалка: текст главы, нажатие на слово, подчёркивание сохранённого, прогресс.
import { h, icon, toast, openSheet, closeSheet } from "../dom.js";
import { app, bookZip, saveProgress, markFinished, addReadingTime, flushActivity, resolveWord, cardFor, subscribe, kindClass, namesOf, ensureNote, moveNote, dictionaryReady } from "../store.js";
import { createClock, TICK_SEC } from "../activity.js";
import { atEnd, almostDone, isFinished } from "../reading.js";
import { noteAt, notesIn, findAnchor } from "../notes.js";
import { openNoteSheet } from "./notes.js";
import { lastPage, backFromReader } from "../nav.js";
import { chapterBlocks, prettyTitle } from "../epub.js";
import { tokenize, findPhrases, sentenceAt } from "../lex.js";
import { openSlip } from "./slip.js";
import { openReaderSettings } from "./settings.js";
import { speak } from "../tts.js";

/** Оборачивает слова абзаца в <span class="w"> и возвращает данные для разбора. */
function wrapParagraph(p) {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  const ptext = nodes.map((n) => n.nodeValue).join("");
  const tokens = tokenize(ptext);
  const spans = new Array(tokens.length);
  let off = 0;
  let ti = 0;
  for (const node of nodes) {
    const val = node.nodeValue;
    const start = off;
    const end = off + val.length;
    const frag = document.createDocumentFragment();
    let cursor = start;
    while (ti < tokens.length && tokens[ti].start < end) {
      const t = tokens[ti];
      if (t.start < cursor || t.end > end) {
        ti++; // слово разорвано разметкой — оставляем без обёртки
        continue;
      }
      if (t.start > cursor) frag.append(val.slice(cursor - start, t.start - start));
      const sp = document.createElement("span");
      sp.className = "w";
      sp.dataset.i = ti;
      sp.textContent = t.raw;
      frag.append(sp);
      spans[ti] = sp;
      cursor = t.end;
      ti++;
    }
    frag.append(val.slice(cursor - start));
    node.replaceWith(frag);
    off = end;
  }
  return { ptext, tokens, spans };
}

function analyze(d, names) {
  d.phrases = findPhrases(app.glossary, d.tokens, d.ptext);
  d.info = d.tokens.map(() => ({ entry: null, ph: null, proper: false }));
  d.phrases.forEach((m, k) => m.idxs.forEach((i) => (d.info[i].ph = k)));
  d.tokens.forEach((t, i) => {
    if (d.info[i].ph != null) return;
    // Harry, Hogwarts: слово, которое в книге всегда пишется с заглавной, считаем именем, а не словарным словом
    if (names.has(t.surf) && t.raw !== t.raw.toLowerCase()) d.info[i].proper = true;
    else d.info[i].entry = resolveWord(t.raw);
  });
}

export function renderReader(root, bookId) {
  const book = app.books.find((b) => b.id === bookId);
  if (!book) {
    location.hash = lastPage.library;
    return;
  }
  let chIdx = Math.min(book.progress?.ch ?? 0, book.chapters.length - 1);
  let paras = [];
  let slip = null;
  let selected = [];
  let lastY = 0;
  let saveTimer = 0;
  let dirty = false; // после последнего сохранения читатель успел сдвинуть текст
  let userScrolled = false; // в этой главе текст листали сами (а не открылась глава)
  let raf = 0;
  // Время чтения: идёт, пока окно видно и вы что-то делаете (листаете, нажимаете); чтение хранится по дням (js/activity.js)
  const clock = createClock();
  clock.touch();
  const clockTimer = setInterval(() => {
    const sec = clock.tick(Date.now(), document.visibilityState === "visible");
    if (sec) addReadingTime(sec);
  }, TICK_SEC * 1000);
  const touch = () => clock.touch();

  const text = h("article", { class: "text", lang: "en" });
  const chnav = h("div", { class: "chnav" });
  const rprog = h("div", { class: "rprog" });
  const titleBtn = h("button", { class: "rtitle", "aria-label": "Оглавление", onClick: openChapters });
  const bar = h(
    "header",
    { class: "rbar" },
    h("button", { class: "iconbtn", "aria-label": "Назад", onClick: () => (location.hash = backFromReader()) }, icon("back", 24)),
    titleBtn,
    h("button", { class: "iconbtn", "aria-label": "Оставить заметку или закладку", onClick: () => openNoteAt(currentPara()) }, icon("flag", 22)),
    h("button", { class: "iconbtn aa", "aria-label": "Настройки чтения", onClick: () => openReaderSettings() }, "Aa"),
    rprog,
  );
  const view = h("main", { class: "view no-tabs reader" }, bar, text, chnav);
  root.replaceChildren(view);

  // ── метки в тексте ──────────────────────────────────────────────────────
  function mark() {
    view.classList.toggle("no-hl", !app.settings.hilite);
    for (const d of paras) {
      d.tokens.forEach((_, i) => {
        const sp = d.spans[i];
        if (!sp) return;
        const inf = d.info[i];
        let cls = "w";
        if (inf.ph != null) {
          const m = d.phrases[inf.ph];
          cls += ` ph ${kindClass(m.entry.t)}${cardFor(m.entry) ? " saved" : ""}`;
        } else if (inf.entry && cardFor(inf.entry)) {
          cls += ` saved ${kindClass(inf.entry.t)}`;
        }
        sp.className = cls;
      });
    }
  }

  function clearSelection() {
    selected.forEach((sp) => sp.removeAttribute("data-sel"));
    selected = [];
  }

  // ── нажатие на слово ────────────────────────────────────────────────────
  function openAt(d, i, onlyWord = false) {
    const tok = d.tokens[i];
    const inf = d.info[i];
    const phrase = !onlyWord && inf.ph != null ? d.phrases[inf.ph] : null;
    const partOfPhrase = inf.ph != null ? d.phrases[inf.ph] : null;
    const proper = !phrase && inf.proper;
    const entry = phrase ? phrase.entry : proper ? null : inf.entry ?? resolveWord(tok.raw);
    const idxs = phrase ? phrase.idxs : [i];
    const first = d.tokens[idxs[0]];
    const last = d.tokens[idxs[idxs.length - 1]];
    const [s, e] = sentenceAt(d.ptext, first.start);
    const sentence = d.ptext.slice(s, e);
    const ctx = {
      s: sentence,
      a: Math.max(0, first.start - s),
      b: Math.min(sentence.length, last.end - s),
      book: book.title,
      bookId: book.id,
      ch: prettyTitle(book.chapters[chIdx].title),
    };
    let alt = null;
    if (phrase) alt = { label: `Только слово: ${tok.raw.toLowerCase()}`, run: () => openAt(d, i, true) };
    else if (partOfPhrase) alt = { label: `Вернуться к фразе: ${partOfPhrase.entry.w}`, run: () => openAt(d, i, false) };

    clearSelection();
    selected = idxs.map((k) => d.spans[k]).filter(Boolean);
    selected.forEach((sp) => (sp.dataset.sel = entry ? entry.t : "x"));

    const k = paras.indexOf(d);
    const note = {
      label: noteAt(app.notes, book.id, chIdx, k) ? "Открыть заметку к этому месту" : "Оставить заметку к этому месту",
      run: () => {
        slip?.close();
        openNoteAt(k, sentence);
      },
    };
    const opts = {
      entry,
      proper,
      surface: d.ptext.slice(first.start, last.end),
      ctx,
      alt,
      note,
      modeless: true,
      onChange: mark,
      onClose: () => {
        clearSelection();
        slip = null;
      },
    };
    if (slip) slip.update(opts);
    else slip = openSlip(opts);

    if (app.settings.speakOnTap) speak(entry ? entry.w : tok.raw);

    // слово не должно оказаться под листом
    setTimeout(() => {
      const sp = selected[0];
      const sheet = slip?.sheet.el;
      if (!sp || !sheet) return;
      const r = sp.getBoundingClientRect();
      const top = sheet.getBoundingClientRect().top;
      if (r.bottom > top - 14) view.scrollBy({ top: r.bottom - top + 28, behavior: "smooth" });
    }, 330);
  }

  text.addEventListener("click", (e) => {
    const sp = e.target.closest(".w");
    const d = sp?.closest("p")?._d;
    if (d) return openAt(d, +sp.dataset.i);
    // Касание поля справа от абзаца — заметка к этому абзацу
    if (e.target === text) {
      const r = text.getBoundingClientRect();
      const edge = r.right - parseFloat(getComputedStyle(text).paddingRight);
      if (e.clientX < edge) return;
      const k = paras.findIndex((p) => {
        const b = p.el.getBoundingClientRect();
        return e.clientY >= b.top - 4 && e.clientY <= b.bottom + 4;
      });
      if (k >= 0) openNoteAt(k);
    }
  });
  view.addEventListener("click", (e) => {
    if (slip && !e.target.closest(".w") && !e.target.closest(".rbar")) slip.close();
  });

  // ── заметки ─────────────────────────────────────────────────────────────
  /** Абзац, который читаете сейчас: примерно на трети высоты экрана. */
  function currentPara() {
    const y = view.scrollTop + view.clientHeight * 0.28;
    const k = paras.findIndex((d) => d.el.offsetTop + d.el.offsetHeight > y);
    return k < 0 ? Math.max(paras.length - 1, 0) : k;
  }

  function pulse(d) {
    if (!d) return;
    d.el.classList.remove("pulse");
    void d.el.offsetWidth; // перезапуск анимации
    d.el.classList.add("pulse");
    setTimeout(() => d.el.classList.remove("pulse"), 2000);
  }

  /** Открывает заметку к абзацу k, а если её нет, создаёт (пустую — это закладка). */
  async function openNoteAt(k, quote) {
    const d = paras[k];
    if (!d) return;
    const n = await ensureNote({ book: book.id, ch: chIdx, p: k, quote: quote || d.ptext, chTitle: prettyTitle(book.chapters[chIdx].title) });
    pulse(d);
    openNoteSheet(n);
  }

  /** Флажки в правом поле: контур — закладка, закрашенный — с комментарием. */
  function renderFlags() {
    for (const d of paras) {
      d.flag?.remove();
      d.flag = null;
    }
    for (const n of notesIn(app.notes, book.id, chIdx)) {
      const d = paras[Math.min(n.p, paras.length - 1)];
      if (!d || d.flag) continue;
      d.flag = h("button", { class: `note-flag${n.text ? " has-text" : ""}`, "aria-label": n.text ? "Заметка к абзацу" : "Закладка", onClick: () => openNoteAt(paras.indexOf(d)) }, icon("flag", 15));
      d.el.append(d.flag);
    }
  }

  /** Номера абзацев в заметках могли сдвинуться, если разбор главы изменился: сверяем по цитате. */
  function reanchor() {
    const texts = paras.map((d) => d.ptext);
    for (const n of notesIn(app.notes, book.id, chIdx)) {
      const k = findAnchor(texts, n);
      if (k !== n.p) moveNote(n.id, k);
    }
  }

  // ── главы ───────────────────────────────────────────────────────────────
  async function load(idx, startPara = 0) {
    slip?.close();
    chIdx = idx;
    paras = []; // пока открывается новая глава, места старой запоминать нельзя
    dirty = false;
    userScrolled = false;
    clearTimeout(saveTimer);
    const ch = book.chapters[idx];
    titleBtn.textContent = prettyTitle(ch.title);
    text.replaceChildren(h("p", { class: "loading" }, "Открываю главу…"));
    chnav.replaceChildren();
    let blocks;
    try {
      const zip = await bookZip(book.id);
      blocks = chapterBlocks(await zip.text(ch.href));
      await dictionaryReady(); // подсветка и переводы нужны сразу; обычно словарь уже готов, а при самом первом открытии это доли секунды
    } catch (err) {
      text.replaceChildren(h("p", { class: "loading" }, err.message || "Не удалось открыть главу"));
      return;
    }
    paras = [];
    const names = namesOf(book);
    const frag = document.createDocumentFragment();
    for (const { kind, el } of blocks) {
      if (kind === "h") {
        el.className = "chtitle";
        el.textContent = prettyTitle(el.textContent);
      } else {
        const d = wrapParagraph(el);
        d.el = el;
        analyze(d, names);
        el._d = d;
        paras.push(d);
      }
      frag.append(el);
    }
    text.replaceChildren(frag);
    if (!blocks.length) text.append(h("p", { class: "note noindent" }, "В этой главе нет текста. Это может быть титульный лист или страница с картинкой."));
    reanchor();
    mark();
    renderFlags();
    buildNav();
    view.scrollTop = 0;
    lastY = 0;
    bar.classList.remove("hide");
    // Пришли из списка заметок: открываем главу на месте заметки и подсвечиваем абзац
    let target = startPara;
    let flash = null;
    if (app.jump) {
      const n = app.notes.find((x) => x.id === app.jump.id);
      if (n && n.book === book.id && n.ch === idx) {
        target = Math.min(n.p, paras.length - 1);
        flash = paras[target];
      }
      app.jump = null;
    }
    if (target > 0) {
      requestAnimationFrame(() => {
        const d = paras[target];
        if (d) view.scrollTop = Math.max(0, d.el.offsetTop - 84);
        pulse(flash);
      });
    } else pulse(flash);
    saveProgress(book.id, idx, target);
    onScroll();
  }

  function buildNav() {
    const last = book.chapters.length - 1;
    // replaceChildren превращает false в слово «false», поэтому пустые места отфильтровываем
    chnav.replaceChildren(
      ...[
        chIdx > 0 && h("button", { class: "btn quiet", "aria-label": "Предыдущая глава", onClick: () => load(chIdx - 1) }, icon("back", 20)),
        chIdx < last ? h("button", { class: "btn primary grow", onClick: () => load(chIdx + 1) }, "Следующая глава", icon("next", 20)) : h("p", { class: "note" }, "Это последняя глава."),
      ].filter(Boolean),
    );
  }

  function openChapters() {
    const sheet = openSheet({
      label: "Оглавление",
      content: h(
        "div",
        null,
        h("h2", { class: "set-title" }, book.title),
        h(
          "ul",
          { class: "rows" },
          book.chapters.map((c, i) =>
            h(
              "li",
              null,
              h(
                "button",
                {
                  class: "row",
                  "aria-current": i === chIdx ? "true" : null,
                  onClick: () => {
                    sheet.close();
                    load(i);
                  },
                },
                h("div", { class: "row-main" }, h("div", { class: "row-hw", style: i === chIdx ? { fontWeight: 700 } : null }, prettyTitle(c.title))),
                i === chIdx && icon("check", 20),
              ),
            ),
          ),
        ),
      ),
    });
  }

  // ── прокрутка: панель, полоска прогресса, запоминание места ──────────────
  // Читаемым считается абзац, который лежит на уровне 86 px от верха экрана; при открытии книги текст ставится так,
  // чтобы нужный абзац начинался на 84 px, поэтому «открыл и закрыл» место не сдвигает.
  const paraAt = (y) => {
    for (let j = 0; j < paras.length; j++) if (paras[j].el.offsetTop + paras[j].el.offsetHeight > y + 86) return j;
    return 0;
  };

  /** Запоминает место сразу, а не через полсекунды после остановки прокрутки: нужно при выходе из книги и при сворачивании. */
  function flushProgress() {
    clearTimeout(saveTimer);
    if (!dirty || !paras.length) return;
    dirty = false;
    const max = view.scrollHeight - view.clientHeight;
    const y = view.scrollTop;
    saveProgress(book.id, chIdx, paraAt(y), max > 0 ? y / max : 1).then(checkFinished);
  }

  /** Дочитали: пролистали последнюю главу до низа или остановились почти в самом конце. Книга отмечается сама, снять отметку можно в меню книги. */
  function checkFinished() {
    if (isFinished(book) || !paras.length) return;
    const max = view.scrollHeight - view.clientHeight;
    if (almostDone(book) || (userScrolled && atEnd(chIdx, book.chapters.length, view.scrollTop, max))) {
      markFinished(book.id).then((changed) => changed && toast("Книга прочитана. Отметка стоит в библиотеке"));
    }
  }

  function onScroll(e) {
    if (e) userScrolled = true; // событие прокрутки от пользователя; вызов из load() сам без события
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const y = view.scrollTop;
      if (y > lastY + 8 && y > 90) bar.classList.add("hide");
      else if (y < lastY - 8 || y < 90) bar.classList.remove("hide");
      lastY = y;
      const max = view.scrollHeight - view.clientHeight;
      rprog.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
    });
    // место запоминаем по самому прокручиванию, а не по кадру: выход из книги сразу после прокрутки не должен его терять
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushProgress, 500);
  }
  view.addEventListener("scroll", onScroll, { passive: true });
  view.addEventListener("scroll", touch, { passive: true });
  view.addEventListener("pointerdown", touch, { passive: true });
  const onHide = () => {
    if (document.visibilityState !== "hidden") return;
    flushProgress();
    flushActivity();
  };
  document.addEventListener("visibilitychange", onHide);
  const onPageHide = () => {
    flushProgress();
    flushActivity();
  };
  window.addEventListener("pagehide", onPageHide);

  const off = subscribe(() => {
    mark();
    renderFlags();
  });
  load(chIdx, book.progress?.p || 0);

  return () => {
    off();
    flushProgress();
    flushActivity();
    clearInterval(clockTimer);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
    cancelAnimationFrame(raf);
    slip?.close();
    closeSheet();
  };
}
