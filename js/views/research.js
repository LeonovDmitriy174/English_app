// research.js (экран) — карточка «Сколько слов нужно, чтобы читать» на экране «Топ слов по частотности»: отметки 1000…9000 семей слов,
// полоска из 50 слов (незнакомые красным), доля известных слов, порог 98%. Цифры и расчёты в js/research.js.
import { h } from "../dom.js";
import { STOPS, DEFAULT_STOP, STRIP, THRESHOLD, oneIn, unknownOf, unknownCells } from "../research.js";
import { SIZE } from "../freqdeck.js";

const label = (n) => `${n / 1000}k`;
const spaced = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, " ");

export function researchCard() {
  let cur = DEFAULT_STOP;
  const stops = STOPS.map((s, i) => h("button", { class: "rs-stop", type: "button", "aria-label": `${spaced(s.n)} семей слов`, onClick: () => show(i) }, label(s.n)));
  const grid = h("div", { class: "rs-grid", "aria-hidden": "true" });
  const pct = h("b", { class: "rs-pct" });
  const one = h("p", { class: "rs-one" });
  const bar = h("div", { class: "rs-body", role: "group", "aria-live": "polite" }, grid, h("div", { class: "rs-num" }, pct, h("p", { class: "rs-cap" }, "слов романа вам знакомы"), one));

  function show(i) {
    cur = i;
    const { n, cover } = STOPS[i];
    stops.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    const unknown = new Set(unknownCells(unknownOf(cover)));
    grid.replaceChildren(...Array.from({ length: STRIP }, (_, k) => h("i", { class: unknown.has(k) ? "u" : "" })));
    pct.textContent = `${Math.round(cover)}%`;
    one.textContent = `${cover >= THRESHOLD ? "Порог 98% пройден: " : ""}одно незнакомое слово из ${oneIn(cover)}`;
    bar.setAttribute("aria-label", `Если знать ${spaced(n)} семей слов, знакомы ${Math.round(cover)}% слов романа`);
  }
  show(cur);

  return h(
    "section",
    { class: "rs", "aria-label": "Исследование: сколько слов нужно, чтобы читать" },
    h("h2", null, "Сколько слов нужно, чтобы читать"),
    h("p", { class: "rs-lead" }, "Лингвист Пол Нейшн посчитал, какую часть романа вы узнаёте, если знаете столько-то самых частых семей слов."),
    h("div", { class: "rs-stops", role: "group", "aria-label": "Сколько семей слов вы знаете" }, ...stops),
    bar,
    h("p", { class: "rs-note" }, h("b", null, "Порог 98%:"), " одно незнакомое слово из 50. С него, по расчётам Нейшна, большинство читателей понимают текст, при 95% лишь немногие. Это минимум, а не гарантия лёгкого чтения."),
    h("p", { class: "rs-note" }, h("b", null, "Сколько нужно:"), " для книг 8–9 тысяч семей слов, для речи (фильмы, разговор) 6–7 тысяч. Семья слов это основное слово со всеми формами: accept, accepted, acceptable, acceptance."),
    h("p", { class: "rs-note" }, `Ниже первые ${spaced(SIZE)} слов этого списка: на таком объёме охват проходит порог.`),
    h("p", { class: "rs-src" }, "Paul Nation, «How large a vocabulary is needed for reading and listening?», 2006: роман Lady Chatterley's Lover, имена собственные считаются знакомыми. Списки: BNC/COCA word family lists."),
  );
}
