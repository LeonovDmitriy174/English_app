// bookwords.js — окно «Слова этой книги»: частые слова и фразы книги, которых ещё нет в вашем словаре.
// «+» добавляет слово, «×» убирает слово, которое вы и так знаете (больше оно не предлагается). Правила отбора: js/bookwords.js.
import { h, icon, openSheet, toast } from "../dom.js";
import { app, saveCard, markKnown, ensureContexts } from "../store.js";
import { bookWords, timesText, hasFrequency, COMMON_ZIPF } from "../bookwords.js";
import { bookCoverage, gainOf, gainText, pct } from "../coverage.js";
import { hitRow } from "./hits.js";

const PAGE = 20; // сколько слов показывать сразу

export function openBookWords(book) {
  // Список собирается один раз при открытии: добавленное слово остаётся в нём с галочкой, а не исчезает из-под пальца
  const all = book.stats?.top ? bookWords({ top: book.stats.top, glossary: app.glossary, cards: app.cards, known: app.known }) : null;
  let cov = null; // охват книги вашими словами; пересчитывается при каждой перерисовке: «×» и «+» его двигают''
  const coverage = () => (book.stats?.freq && app.glossary?.list?.length ? bookCoverage({ stats: book.stats, glossary: app.glossary, cards: app.cards, known: app.known }) : null);
  const gone = new Set(); // убранные кнопкой «×»
  let shown = PAGE;
  let openId = null;
  let added = 0;
  const busy = new Set();

  const body = h("div", { class: "aw-body" });
  const root = h("div", { class: "aw" }, h("div", { class: "aw-top" }, h("h2", { class: "set-title" }, "Слова этой книги")), body);
  const sheet = openSheet({
    content: root,
    cls: "addword",
    label: "Слова этой книги",
    onClose: () => {
      if (added) ensureContexts(); // у новых слов могут найтись предложения в загруженных книгах
    },
  });

  async function add(e) {
    if (app.cards.has(e.id) || busy.has(e.id)) return;
    busy.add(e.id);
    try {
      await saveCard(e);
      added++;
      toast(`«${e.w}» добавлено в словарь`);
    } finally {
      busy.delete(e.id);
    }
    paint();
  }

  async function know(e) {
    gone.add(e.id);
    await markKnown(e.id);
    toast(`«${e.w}» больше не предлагается`);
    paint();
  }

  /** «встречается 118 раз, охват +0,3%»: сколько слов текста закроет это слово. У фраз прироста нет: они состоят из слов. */
  function noteOf(item) {
    const g = item.entry.t === "w" && cov ? gainText(gainOf(cov, [item.entry.id])) : "";
    return g ? `${timesText(item.n)}, охват ${g}` : timesText(item.n);
  }

  /** Строка про охват над списком: сколько знаете сейчас и что даст первая часть списка. */
  function coverageLine(items) {
    if (!cov) return null;
    const ids = items.slice(0, shown).filter((x) => x.entry.t === "w").map((x) => x.entry.id);
    const add = gainOf(cov, ids);
    const tail = ids.length && add >= 0.001 ? ` Если выучить показанные слова (${ids.length}), охват вырастет примерно до ${pct(Math.min(1, cov.share + add))}.` : "";
    return h("p", { class: "note" }, `Сейчас вы знаете ${pct(cov.share)} слов этой книги.${tail}`);
  }

  /** Простые слова скрыты из списка (их знает любой читатель), но в охват входят, пока вы их не проверили. */
  function commonNote() {
    if (!cov) return null;
    const n = cov.rest.filter((r) => r.entry.t === "w" && Number.isFinite(r.entry.z) && r.entry.z > COMMON_ZIPF).reduce((s, r) => s + r.n, 0) / cov.base;
    if (n < 0.01) return null;
    return h(
      "div",
      null,
      h("p", { class: "note" }, `Самые простые слова в этот список не попадают, но ещё ${pct(n)} текста приходится на простые слова, которых нет в вашем словаре. Проверьте их в «Пополнить словарь», и охват вырастет.`),
      h("button", { class: "linkbtn", onClick: () => (location.hash = "#/replenish") }, "Проверить простые слова"),
    );
  }

  function row(item) {
    const e = item.entry;
    const open = openId === e.id;
    const saved = app.cards.has(e.id);
    const dismiss = h("button", { class: "dismissbtn", "aria-label": `Уже знаю «${e.w}», убрать из списка`, onClick: () => know(e) }, icon("close", 20));
    return hitRow(
      { entry: e, note: noteOf(item) },
      {
        saved,
        open,
        onToggle: () => {
          openId = open ? null : e.id;
          paint();
        },
        onAdd: () => add(e),
        aside: saved ? [] : [dismiss],
      },
    );
  }

  function paint() {
    cov = coverage();
    const intro = h("p", { class: "note" }, `В «${book.title}» часто встречаются эти слова и фразы, а в вашем словаре их пока нет. «+» добавляет слово, «×» убирает то, что вы и так знаете.`);
    if (!all) {
      body.replaceChildren(h("p", { class: "note" }, app.analysis?.id === book.id ? "Анализ книги идёт, список появится, когда он закончится." : "Анализ книги ещё не готов. Попробуйте через минуту."));
      return;
    }
    const items = all.filter((x) => !gone.has(x.entry.id));
    if (!items.length) {
      body.replaceChildren(intro, h("p", { class: "note" }, "Подходящих слов не осталось: всё частое из этой книги уже в вашем словаре или помечено как знакомое."));
      return;
    }
    const part = items.slice(0, shown);
    body.replaceChildren(
      ...[
        intro,
        coverageLine(items),
        h("ul", { class: "hits" }, part.map(row)),
        items.length > shown ? h("button", { class: "linkbtn", onClick: () => ((shown += PAGE), paint()) }, "Показать ещё") : null,
        hasFrequency(app.glossary) ? commonNote() : h("p", { class: "note" }, "В словаре нет данных о частоте слов, поэтому среди предложенных есть и совсем простые слова."),
      ].filter(Boolean),
    );
  }

  paint();
  return sheet;
}
