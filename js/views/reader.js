// reader.js — читалка: текст главы, нажатие на слово, подчёркивание сохранённого, прогресс.
import { h, icon, openSheet, closeSheet } from "../dom.js";
import { app, bookZip, saveProgress, resolveWord, cardFor, subscribe, kindClass } from "../store.js";
import { chapterBlocks } from "../epub.js";
import { tokenize, findPhrases, sentenceAt } from "../lex.js";
import { openSlip } from "./slip.js";
import { openReaderSettings } from "./settings.js";
import { speak } from "../tts.js";

const SMALL = new Set(["a", "an", "the", "of", "in", "on", "at", "to", "and", "or", "but", "for", "with", "from", "by"]);

/** «2. THE VANISHING GLASS» → «2. The Vanishing Glass» (только если заголовок набран капсом). */
export function prettyTitle(s) {
  if (!s || s !== s.toUpperCase() || !/[A-Z]{2}/.test(s)) return s;
  let first = true;
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => {
      if (!/[a-z]/.test(w)) return w;
      const keep = !first && SMALL.has(w);
      first = false;
      return keep ? w : w.replace(/[a-z]/, (c) => c.toUpperCase());
    })
    .join("");
}

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

function analyze(d) {
  d.phrases = findPhrases(app.glossary, d.tokens, d.ptext);
  d.info = d.tokens.map(() => ({ entry: null, ph: null }));
  d.phrases.forEach((m, k) => m.idxs.forEach((i) => (d.info[i].ph = k)));
  d.tokens.forEach((t, i) => {
    if (d.info[i].ph == null) d.info[i].entry = resolveWord(t.raw);
  });
}

export function renderReader(root, bookId) {
  const book = app.books.find((b) => b.id === bookId);
  if (!book) {
    location.hash = "#/library";
    return;
  }
  let chIdx = Math.min(book.progress?.ch ?? 0, book.chapters.length - 1);
  let paras = [];
  let slip = null;
  let selected = [];
  let lastY = 0;
  let saveTimer = 0;
  let raf = 0;

  const text = h("article", { class: "text", lang: "en" });
  const chnav = h("div", { class: "chnav" });
  const rprog = h("div", { class: "rprog" });
  const titleBtn = h("button", { class: "rtitle", "aria-label": "Оглавление", onClick: openChapters });
  const bar = h(
    "header",
    { class: "rbar" },
    h("button", { class: "iconbtn", "aria-label": "К списку книг", onClick: () => (location.hash = "#/library") }, icon("back", 24)),
    titleBtn,
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
    const entry = phrase ? phrase.entry : inf.entry ?? resolveWord(tok.raw);
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

    const opts = {
      entry,
      surface: d.ptext.slice(first.start, last.end),
      ctx,
      alt,
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
    if (d) openAt(d, +sp.dataset.i);
  });
  view.addEventListener("click", (e) => {
    if (slip && !e.target.closest(".w") && !e.target.closest(".rbar")) slip.close();
  });

  // ── главы ───────────────────────────────────────────────────────────────
  async function load(idx, startPara = 0) {
    slip?.close();
    chIdx = idx;
    const ch = book.chapters[idx];
    titleBtn.textContent = prettyTitle(ch.title);
    text.replaceChildren(h("p", { class: "loading" }, "Открываю главу…"));
    chnav.replaceChildren();
    let blocks;
    try {
      const zip = await bookZip(book.id);
      blocks = chapterBlocks(await zip.text(ch.href));
    } catch (err) {
      text.replaceChildren(h("p", { class: "loading" }, err.message || "Не удалось открыть главу"));
      return;
    }
    paras = [];
    const frag = document.createDocumentFragment();
    for (const { kind, el } of blocks) {
      if (kind === "h") {
        el.className = "chtitle";
        el.textContent = prettyTitle(el.textContent);
      } else {
        const d = wrapParagraph(el);
        d.el = el;
        analyze(d);
        el._d = d;
        paras.push(d);
      }
      frag.append(el);
    }
    text.replaceChildren(frag);
    mark();
    buildNav();
    view.scrollTop = 0;
    lastY = 0;
    bar.classList.remove("hide");
    if (startPara > 0) {
      requestAnimationFrame(() => {
        const d = paras[startPara];
        if (d) view.scrollTop = Math.max(0, d.el.offsetTop - 84);
      });
    }
    saveProgress(book.id, idx, startPara);
    onScroll();
  }

  function buildNav() {
    const last = book.chapters.length - 1;
    chnav.replaceChildren(
      chIdx > 0 && h("button", { class: "btn quiet", "aria-label": "Предыдущая глава", onClick: () => load(chIdx - 1) }, icon("back", 20)),
      chIdx < last ? h("button", { class: "btn primary grow", onClick: () => load(chIdx + 1) }, "Следующая глава", icon("next", 20)) : h("p", { class: "note" }, "Это последняя глава."),
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
  function onScroll() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const y = view.scrollTop;
      if (y > lastY + 8 && y > 90) bar.classList.add("hide");
      else if (y < lastY - 8 || y < 90) bar.classList.remove("hide");
      lastY = y;
      const max = view.scrollHeight - view.clientHeight;
      rprog.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        let k = 0;
        for (let j = 0; j < paras.length; j++) {
          if (paras[j].el.offsetTop + paras[j].el.offsetHeight > y + 70) {
            k = j;
            break;
          }
        }
        saveProgress(book.id, chIdx, k);
      }, 500);
    });
  }
  view.addEventListener("scroll", onScroll, { passive: true });

  const off = subscribe(mark);
  load(chIdx, book.progress?.p || 0);

  return () => {
    off();
    clearTimeout(saveTimer);
    cancelAnimationFrame(raf);
    slip?.close();
    closeSheet();
  };
}
