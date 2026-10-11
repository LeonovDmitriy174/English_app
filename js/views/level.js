// level.js — индикатор уровня слова: шесть точек. Время повторения пользователю не показывается.
import { h } from "../dom.js";
import { PIPS } from "../levels.js";

/** lv: уровень карточки (0 = новая). gained: подсветить только что появившуюся точку. */
export function levelBar(lv, gained = false) {
  const lit = Math.min(lv, PIPS);
  const mastered = lv > PIPS;
  return h(
    "span",
    { class: `lvl${mastered ? " mastered" : ""}`, role: "img", "aria-label": mastered ? "Слово освоено" : lv ? `Уровень ${lv} из ${PIPS}` : "Новое слово" },
    Array.from({ length: PIPS }, (_, i) => h("i", { class: i < lit ? (gained && i === lit - 1 ? "on gain" : "on") : "" })),
  );
}
