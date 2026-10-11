// dom.js — маленькие помощники для интерфейса: создание узлов, иконки, всплывающие сообщения, нижние листы.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  back: '<polyline points="15 18 9 12 15 6"/>',
  next: '<polyline points="9 18 15 12 9 6"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  speaker: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
};

export function icon(name, size = 22) {
  const span = document.createElement("span");
  span.className = "ico";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  return span;
}

// ── Сообщение внизу экрана ────────────────────────────────────────────────
let toastTimer;
export function toast(text) {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status" }, text);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 2200);
}

// ── Нижний лист ───────────────────────────────────────────────────────────
// Один лист на экране. Закрывается по тапу на фон, по Escape и свайпом вниз за «ручку».
let current = null;

export function openSheet({ content, cls = "", label = "", onClose, modeless = false } = {}) {
  current?.close(true);
  const scrim = h("div", { class: modeless ? "scrim clear" : "scrim" });
  const grip = h("div", { class: "grip", "aria-hidden": "true" });
  const body = h("div", { class: "sheet-body" }, content);
  const el = h("div", { class: `sheet ${cls}`, role: "dialog", "aria-label": label }, grip, body);
  document.body.append(scrim, el);
  requestAnimationFrame(() => {
    scrim.classList.add("show");
    el.classList.add("open");
  });

  let closed = false;
  const api = {
    el,
    body,
    close(silent) {
      if (closed) return;
      closed = true;
      current = null;
      document.removeEventListener("keydown", onKey);
      scrim.classList.remove("show");
      el.classList.remove("open");
      el.style.transform = "";
      setTimeout(() => {
        scrim.remove();
        el.remove();
      }, 260);
      if (!silent) onClose?.();
    },
    setContent(node) {
      body.replaceChildren(node);
    },
  };
  const onKey = (e) => e.key === "Escape" && api.close();
  document.addEventListener("keydown", onKey);
  scrim.addEventListener("click", () => api.close());

  // свайп вниз
  let startY = null;
  let dy = 0;
  grip.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    dy = 0;
    el.style.transition = "none";
  }, { passive: true });
  grip.addEventListener("touchmove", (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  grip.addEventListener("touchend", () => {
    if (startY == null) return;
    el.style.transition = "";
    startY = null;
    if (dy > 90) api.close();
    else el.style.transform = "";
  });

  current = api;
  return api;
}

export const closeSheet = () => current?.close();
export const hasSheet = () => !!current;
