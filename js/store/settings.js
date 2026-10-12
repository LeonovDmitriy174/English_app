// settings.js — настройки приложения: тема, размер шрифта и остальные.
import { db } from "../db.js";
import { app, emit } from "./state.js";

export function applySettings() {
  const root = document.documentElement;
  if (app.settings.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = app.settings.theme;
  root.style.setProperty("--read-size", `${app.settings.fontSize}px`);
}

export async function setSetting(key, value) {
  app.settings[key] = value;
  applySettings();
  await db.put("kv", { key: "settings", value: app.settings });
  emit();
}
