// dictsettings.js — настройки словаря: сколько новых слов в день и какие режимы входят в микс.
// Тема, размер текста, озвучка и резервная копия остались в настройках приложения (settings.js).
import { h, openSheet } from "../dom.js";
import { app, setSetting } from "../store.js";
import { MODES, normalizeMix } from "../modes.js";
import { canSpeak } from "../tts.js";
import { row, stepper } from "./settings.js";

/** Режимы, которые на этом устройстве вообще возможны (озвучки может не быть). */
export const modeAvailable = (key) => key !== "listen" || canSpeak();

/** Режимы микса из настроек с учётом того, что доступно: хотя бы один режим есть всегда. */
export function mixModes() {
  const list = normalizeMix(app.settings.mixModes).filter(modeAvailable);
  return list.length ? list : ["choice"];
}

export function openDictSettings() {
  const switches = [];

  const paint = () => {
    const active = mixModes();
    for (const { key, sw } of switches) {
      const on = active.includes(key);
      sw.setAttribute("aria-checked", String(on));
      // нельзя выключить последний режим: микс без режимов ничего не повторял бы
      sw.disabled = !modeAvailable(key) || (on && active.length === 1);
    }
  };

  const modeSwitch = (m) => {
    const sw = h("button", { class: "switch", role: "switch", "aria-label": m.name, "aria-checked": "false" });
    sw.addEventListener("click", async () => {
      const active = mixModes();
      const next = active.includes(m.key) ? active.filter((k) => k !== m.key) : [...active, m.key];
      if (!next.length) return;
      await setSetting("mixModes", MODES.map((x) => x.key).filter((k) => next.includes(k)));
      paint();
    });
    switches.push({ key: m.key, sw });
    return sw;
  };

  const sheet = openSheet({
    label: "Настройки словаря",
    content: h(
      "div",
      null,
      h("h2", { class: "set-title" }, "Настройки словаря"),
      row("Новых слов в день", "Сколько новых карточек добавлять в повторение", stepper("newPerDay", { min: 5, max: 60, step: 5, label: "Новых слов в день" })),
      h("h3", { class: "set-sub" }, "Режимы в миксе"),
      h("p", { class: "note tight" }, "Микс чередует отмеченные режимы. Новым словам и словам на низких уровнях достаются простые задания, на высоких те, где слово нужно вспомнить самому."),
      ...MODES.map((m) => row(m.name, modeAvailable(m.key) ? m.desc : "На этом устройстве нет озвучки", modeSwitch(m))),
      h("p", { class: "note" }, "Новое слово всегда начинается с выбора из вариантов: незнакомое слово писать рано. Выбор поднимает слово не выше третьего уровня: угадать вариант можно и не зная слова. Выше слово растёт от заданий, где его нужно написать или вписать. Если в миксе остался один Выбор, слова будут задерживаться на третьем уровне."),
    ),
  });
  paint();
  return sheet;
}
