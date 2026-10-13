// pairs.js — разминка «Пары»: пять слов слева, пять переводов справа, их нужно соединить.
// Уровни слов она не меняет: это способ вспомнить слова перед повторением. Логика выбора в js/pairs.js.
import { h, icon } from "../dom.js";
import { app } from "../store.js";
import { speak } from "../tts.js";
import { pickPairs, rightOrder, sizeStep } from "../pairs.js";

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

/**
 * Показывает разминку в view. cards — карточки, из которых выбираются пары (лучше сначала самые «свежие»);
 * onExit вызывается, когда вы закрыли разминку. Возвращает false, если подходящих карточек меньше трёх.
 */
export function runPairs({ view, cards, onExit }) {
  if (!pickPairs(cards)) return false;
  document.body.classList.add("immersive");
  round();
  return true;

  function round() {
    const left = pickPairs(cards);
    const byId = new Map(left.map((p) => [p.id, p]));
    const right = rightOrder(left).map((id) => byId.get(id));
    const buttons = new Map(); // "l:id" и "r:id" -> кнопка
    let selected = null; // { side, id }
    let matched = 0;
    let mistakes = 0;
    let busy = false;

    const foot = h("div", { class: "rv-foot" });
    const note = h("p", { class: "rv-hint", "aria-live": "polite" }, "Соедините слово и его перевод");

    const stepL = sizeStep(left.map((p) => p.w), "l");
    const stepR = sizeStep(right.map((p) => p.ru), "r");
    const make = (side, p) => {
      const text = side === "l" ? p.w : p.ru;
      const step = side === "l" ? stepL : stepR;
      const b = h("button", { class: `pair ${side === "l" ? "pair-w" : "pair-m"}${step ? ` s${step}` : ""}`, "aria-pressed": "false", onClick: () => tap(side, p) }, h("span", { class: "t" }, text));
      buttons.set(`${side}:${p.id}`, b);
      return b;
    };
    // Классы плиток pair-w (слово) и pair-m (перевод) не «en»/«ru»: общий класс .ru задаёт отступы и шрифт для переводов в других местах и сдвигал правый столбец.
    // Одна общая сетка (а не два столбца): строки у слова и перевода те же, высота у всех плиток одинаковая. Сначала столбец слов, потом столбец переводов.
    const cols = h("div", { class: "pairs", style: { gridTemplateRows: `repeat(${left.length}, 1fr)` } }, left.map((p) => make("l", p)), right.map((p) => make("r", p)));

    function select(side, id) {
      for (const b of buttons.values()) b.setAttribute("aria-pressed", "false");
      selected = side ? { side, id } : null;
      if (selected) buttons.get(`${side}:${id}`).setAttribute("aria-pressed", "true");
    }

    function tap(side, p) {
      if (busy) return;
      const mine = buttons.get(`${side}:${p.id}`);
      if (mine.classList.contains("matched")) return;
      if (side === "l" && app.settings.speakOnTap) speak(p.w);
      if (!selected || selected.side === side) return select(side, p.id);
      // выбраны слово и перевод: верная ли пара
      const other = { id: selected.id, side: selected.side };
      const l = side === "l" ? p.id : other.id;
      const r = side === "r" ? p.id : other.id;
      const a = buttons.get(`l:${l}`);
      const b = buttons.get(`r:${r}`);
      select(null);
      if (l === r) {
        for (const el of [a, b]) {
          el.classList.add("matched");
          el.disabled = true;
          el.append(icon("check", 13)); // значок на углу плитки: текст не переносится заново
        }
        matched += 1;
        if (matched === left.length) finish();
        return;
      }
      mistakes += 1;
      busy = true;
      for (const el of [a, b]) el.classList.add("bad");
      setTimeout(() => {
        for (const el of [a, b]) el.classList.remove("bad");
        busy = false;
      }, 450);
    }

    function finish() {
      note.textContent = mistakes ? `Готово. ${mistakes} ${plural(mistakes, ["ошибка", "ошибки", "ошибок"])}` : "Готово, без ошибок";
      foot.replaceChildren(h("button", { class: "btn primary block", onClick: round }, "Ещё раз"), h("button", { class: "linkbtn", style: { alignSelf: "center" }, onClick: onExit }, "К повторению"));
      foot.querySelector(".btn")?.focus();
    }

    view.className = "view no-tabs";
    view.replaceChildren(
      h(
        "div",
        { class: "rv-stage" },
        h("div", { class: "rv-top" }, h("button", { class: "iconbtn", "aria-label": "Закрыть разминку", onClick: onExit }, icon("close", 24)), h("p", { class: "rv-title" }, "Пары")),
        h("div", { class: "paper" }, h("div", { class: "rv-body" }, note, cols)),
        foot,
      ),
    );
  }
}
