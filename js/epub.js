// epub.js — разбор EPUB в браузере: метаданные, оглавление, обложка, текст глав.
import { openZip } from "./zip.js";

/** Версия разбора EPUB. Книги, добавленные более ранней версией, при запуске разбираются заново (store.js). */
export const EPUB_PARSER = 3;

const xml = (s) => new DOMParser().parseFromString(s, "application/xml");

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
/**
 * Страницы EPUB написаны на XHTML, а читаем мы их HTML-разбором. Там самозакрытый тег — это открывающий:
 * <title/>, <script src=".."/> или <style/> в заголовке «съедают» всю страницу, и глава оказывается пустой.
 * Поэтому <имя .../> разворачиваем в <имя ...></имя> (пустые теги вроде <br/> и <img/> не трогаем).
 */
export function fixSelfClosing(src) {
  return src.replace(/<([a-zA-Z][\w:.-]*)(\s[^<>]*?)?\s*\/>/g, (m, name, attrs = "") => (VOID.has(name.toLowerCase()) ? m : `<${name}${attrs}></${name}>`));
}
const html = (s) => new DOMParser().parseFromString(fixSelfClosing(s), "text/html");

function resolve(base, href) {
  const clean = decodeURIComponent(href.split("#")[0]);
  const parts = (base + clean).split("/");
  const out = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return out.join("/");
}

const firstText = (doc, tag) => doc.getElementsByTagName(tag)[0]?.textContent.trim() || "";

function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Служебные страницы (аннотация, оглавление, обложка, посвящение): по названию и по краям книги
const FRONT = /^(annotation|contents|table of contents|copyright|cover|title page|about the author|dedication|acknowledg(e)?ments|also by .*|other books by .*)$/i;
// Короткие страницы по краям книги, которые всё же текст истории: пролог, эпилог, интерлюдия, глава
const STORY = /^(prologue|epilogue|interlude|afterword|chapter\b|part\b|book\b|[ivxlc]+\.?$|\d+\.?$)/i;
const REAL_CHARS = 1500; // «настоящая» глава: от этого размера
const PAGE_CHARS = 150; // короче страница считается пустой или разделителем («Часть первая») и в книгу не входит

/**
 * Какие файлы книги считать главами. chapters: [{ title, chars, ... }] в порядке чтения.
 * Настоящие главы (от 1500 знаков) идут всегда. Всё, что лежит МЕЖДУ первой и последней из них, остаётся, даже если короткое:
 * это короткие главы (басни, стихи, интерлюдии), а не служебные страницы; убираются только пустые страницы и страницы со служебным
 * названием (оглавление, авторские права). По краям книги короткие страницы остаются, только если они похожи на текст
 * истории (пролог, эпилог, «Глава 3»). Если настоящих глав нет совсем (сборник коротких рассказов), остаётся всё, что не служебное.
 */
export function selectChapters(chapters) {
  const title = (c) => (c.title || "").trim();
  const service = (c) => FRONT.test(title(c));
  const big = (c) => c.chars >= REAL_CHARS && !service(c);
  const first = chapters.findIndex(big);
  if (first < 0) {
    const rest = chapters.filter((c) => !service(c) && c.chars >= PAGE_CHARS);
    return rest.length ? rest : chapters;
  }
  let last = chapters.length - 1;
  while (last > first && !big(chapters[last])) last--;
  return chapters.filter((c, i) => {
    if (service(c) || c.chars < PAGE_CHARS) return false;
    if (i >= first && i <= last) return true;
    return big(c) || STORY.test(title(c));
  });
}

/** Читает EPUB. Возвращает { meta, chapters, cover } — всё, что нужно для библиотеки. */
export async function readEpub(buffer) {
  const zip = await openZip(buffer);
  if (!zip.has("META-INF/container.xml")) throw new Error("В файле нет META-INF/container.xml: это не EPUB.");
  const container = await zip.text("META-INF/container.xml");
  const opfPath = /full-path="([^"]+)"/.exec(container)?.[1];
  if (!opfPath) throw new Error("Не найден файл описания книги (OPF).");
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opf = xml(await zip.text(opfPath));

  const manifest = new Map();
  for (const it of opf.getElementsByTagName("item")) {
    manifest.set(it.getAttribute("id"), {
      href: resolve(base, it.getAttribute("href") || ""),
      type: it.getAttribute("media-type") || "",
      props: it.getAttribute("properties") || "",
    });
  }
  const spine = [...opf.getElementsByTagName("itemref")].filter((r) => r.getAttribute("linear") !== "no").map((r) => manifest.get(r.getAttribute("idref"))).filter(Boolean);

  // Названия глав: NCX (EPUB 2) или nav (EPUB 3)
  const titles = new Map();
  const ncx = [...manifest.values()].find((m) => m.type === "application/x-dtbncx+xml");
  if (ncx && zip.has(ncx.href)) {
    const ncxBase = ncx.href.includes("/") ? ncx.href.slice(0, ncx.href.lastIndexOf("/") + 1) : "";
    for (const np of xml(await zip.text(ncx.href)).getElementsByTagName("navPoint")) {
      const label = np.getElementsByTagName("text")[0]?.textContent.trim();
      const src = np.getElementsByTagName("content")[0]?.getAttribute("src");
      if (label && src) {
        const key = resolve(ncxBase, src);
        if (!titles.has(key)) titles.set(key, label);
      }
    }
  }
  const nav = [...manifest.values()].find((m) => m.props.split(/\s+/).includes("nav"));
  if (nav && zip.has(nav.href)) {
    const navBase = nav.href.includes("/") ? nav.href.slice(0, nav.href.lastIndexOf("/") + 1) : "";
    for (const a of html(await zip.text(nav.href)).querySelectorAll("nav a[href]")) {
      const key = resolve(navBase, a.getAttribute("href"));
      if (!titles.has(key)) titles.set(key, a.textContent.trim().replace(/\s+/g, " "));
    }
  }

  const chapters = [];
  for (const item of spine) {
    if (!/x?html/.test(item.type) || !zip.has(item.href)) continue;
    const raw = await zip.text(item.href);
    const doc = html(raw);
    const chars = (doc.body?.textContent || "").replace(/\s+/g, " ").trim().length;
    const heading = doc.querySelector("h1, h2, h3, [class*='title']")?.textContent.replace(/\s+/g, " ").trim();
    chapters.push({ href: item.href, chars, title: titles.get(item.href) || heading || "" });
  }
  const real = selectChapters(chapters);
  real.forEach((c, i) => {
    if (!c.title) c.title = `Часть ${i + 1}`;
  });

  // Обложка
  let cover = null;
  const coverId = [...opf.getElementsByTagName("meta")].find((m) => m.getAttribute("name") === "cover")?.getAttribute("content");
  const coverItem = (coverId && manifest.get(coverId)) || [...manifest.values()].find((m) => m.props.split(/\s+/).includes("cover-image")) || [...manifest.values()].find((m) => /^image\//.test(m.type) && /cover/i.test(m.href));
  if (coverItem && zip.has(coverItem.href)) cover = new Blob([await zip.read(coverItem.href)], { type: coverItem.type || "image/jpeg" });

  const title = firstText(opf, "dc:title") || "Без названия";
  const author = firstText(opf, "dc:creator");
  const id = hash(`${title}|${author}|${buffer.byteLength}`);
  return { meta: { id, title, author, lang: firstText(opf, "dc:language") }, chapters: real, cover, zip };
}

// ── Текст главы → абзацы ──────────────────────────────────────────────────
const BLOCK = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "li", "section", "article", "ul", "ol", "table", "tr", "td", "body"]);
const SKIP = new Set(["script", "style", "img", "svg", "image", "head", "title", "meta", "link"]);

function cleanInline(node, out) {
  for (const ch of node.childNodes) {
    if (ch.nodeType === 3) {
      out.appendChild(document.createTextNode(ch.nodeValue.replace(/\s+/g, " ")));
    } else if (ch.nodeType === 1) {
      const tag = ch.tagName.toLowerCase();
      if (SKIP.has(tag)) continue;
      if (tag === "br") out.appendChild(document.createElement("br"));
      else if (tag === "i" || tag === "em" || tag === "cite") cleanInline(ch, out.appendChild(document.createElement("em")));
      else if (tag === "b" || tag === "strong") cleanInline(ch, out.appendChild(document.createElement("strong")));
      else cleanInline(ch, out);
    }
  }
}

const hasBlockChild = (el) => [...el.children].some((c) => BLOCK.has(c.tagName.toLowerCase()));
const isHeading = (el) => /^h[1-6]$/i.test(el.tagName) || /title|head|chapter/i.test(el.getAttribute("class") || "");

/** HTML главы → массив { kind: 'h' | 'p', el } с очищенной разметкой. */
export function chapterBlocks(htmlText) {
  const blocks = blocksOf(html(htmlText));
  if (blocks.length) return blocks;
  // Запасной путь: заголовок страницы мог быть разобран криво, а текст в самой странице есть. Разбираем без <head>.
  const bodyOnly = htmlText.replace(/<head\b[\s\S]*?<\/head\s*>/i, "");
  return bodyOnly.length < htmlText.length ? blocksOf(html(bodyOnly)) : blocks;
}

function blocksOf(doc) {
  const blocks = [];
  const push = (kind, nodes) => {
    const el = document.createElement(kind === "h" ? "h2" : "p");
    nodes.forEach((n) => cleanInline(n, el));
    if (!el.textContent.trim()) return;
    el.firstChild?.nodeType === 3 && (el.firstChild.nodeValue = el.firstChild.nodeValue.replace(/^\s+/, ""));
    el.lastChild?.nodeType === 3 && (el.lastChild.nodeValue = el.lastChild.nodeValue.replace(/\s+$/, ""));
    blocks.push({ kind, el });
  };
  const walk = (parent) => {
    let pending = [];
    const flush = () => {
      if (pending.length) {
        const holder = document.createElement("span");
        pending.forEach((n) => holder.appendChild(n.cloneNode(true)));
        push("p", [holder]);
        pending = [];
      }
    };
    for (const ch of parent.childNodes) {
      if (ch.nodeType === 3) pending.push(ch);
      else if (ch.nodeType === 1) {
        const tag = ch.tagName.toLowerCase();
        if (SKIP.has(tag)) continue;
        if (BLOCK.has(tag)) {
          flush();
          if (hasBlockChild(ch)) walk(ch);
          else push(isHeading(ch) ? "h" : "p", [ch]);
        } else pending.push(ch);
      }
    }
    flush();
  };
  walk(doc.body);
  return blocks;
}

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
