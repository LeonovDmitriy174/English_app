// level.js — индикатор уровня слова: десять точек, по точке на уровень. Время повторения пользователю не показывается.
import { h } from "../dom.js";
import { PIPS, KNOWN } from "../levels.js";

/** lv: уровень карточки (0 = новая). gained: подсветить только что появившуюся точку. */
export function levelBar(lv, gained = false) {
  const lit = Math.min(lv, PIPS);
  const mastered = lv >= PIPS;
  return h(
    "span",
    { class: `lvl${mastered ? " mastered" : ""}`, role: "img", "aria-label": mastered ? "Слово освоено" : lv ? `Уровень ${lv} из ${PIPS}` : "Новое слово" },
    // перед первой точкой «Знаю» небольшой просвет: пять точек учится, пять знакомы
    Array.from({ length: PIPS }, (_, i) => h("i", { class: [i < lit && (gained && i === lit - 1 ? "on gain" : "on"), i === KNOWN - 1 && "k"].filter(Boolean).join(" ") })),
  );
}
