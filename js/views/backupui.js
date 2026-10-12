// backupui.js — сохранение копии данных и напоминание о ней. Правила напоминания в js/backup.js.
import { h, toast } from "../dom.js";
import { app, exportData, markBackup, snoozeBackup, firstDataAt, APP_NAME } from "../store.js";
import { nudge, nudgeText, backupName } from "../backup.js";

/**
 * Отдаёт копию через системное меню «Поделиться» (на iPhone оттуда её можно положить в «Файлы» или iCloud),
 * а если устройство так не умеет, сохраняет обычным файлом. Файл можно отправить в нескольких форматах:
 * сначала как JSON, а если меню его не принимает, как обычный текст с тем же именем.
 * Возвращает "shared" | "downloaded" | "cancelled" | "failed". «Последняя копия» запоминается, только если файл ушёл.
 */
export async function saveBackup() {
  let text;
  try {
    text = await exportData();
  } catch {
    toast("Не удалось собрать копию данных");
    return "failed";
  }
  const name = backupName();
  const shared = await tryShare(text, name);
  if (shared === "shared") {
    await markBackup();
    return "shared";
  }
  if (shared === "cancelled") return "cancelled";
  download(text, name);
  await markBackup();
  toast(`Копия сохранена файлом ${name}`);
  return "downloaded";
}

async function tryShare(text, name) {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return "unavailable";
  for (const type of ["application/json", "text/plain"]) {
    let file;
    try {
      file = new File([text], name, { type });
    } catch {
      return "unavailable";
    }
    let can = false;
    try {
      can = navigator.canShare({ files: [file] });
    } catch {
      /* считаем, что нельзя */
    }
    if (!can) continue;
    try {
      await navigator.share({ files: [file], title: `${APP_NAME}: копия данных` });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled"; // закрыли меню, ничего не сохранив
      return "unavailable"; // например, браузер потребовал свежего нажатия: сохраним файлом
    }
  }
  return "unavailable";
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

/** Плашка напоминания о копии для экрана библиотеки или null, если напоминать не нужно. */
export function backupNudge() {
  const state = nudge({ at: app.backup.at, since: firstDataAt(), snoozeUntil: app.backup.snoozeUntil, cards: app.cards.size, notes: app.notes.length });
  if (!state.show) return null;
  const save = h("button", {
    class: "btn primary",
    onClick: async () => {
      save.disabled = true;
      await saveBackup(); // после удачного сохранения экран перерисуется и плашка исчезнет
      save.disabled = false;
    },
  }, "Сохранить копию");
  return h("section", { class: "nudge", "aria-label": "Напоминание о копии данных" }, h("p", null, nudgeText(state, app.cards.size)), h("div", { class: "nudge-actions" }, save, h("button", { class: "btn quiet", onClick: () => snoozeBackup() }, "Позже")));
}
