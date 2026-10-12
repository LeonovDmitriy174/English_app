// cover.js — обложка книги для списков и главной: картинка из файла, а если её нет, первая буква названия.
import { h } from "../dom.js";

const initialOf = (title) => (title || "?").trim()[0]?.toUpperCase();

export const blankCover = (title) => h("div", { class: "cover blank-cover", "aria-hidden": "true" }, initialOf(title));

export function cover(book) {
  if (book.cover) {
    const url = URL.createObjectURL(book.cover);
    const img = h("img", { class: "cover", alt: "", src: url, loading: "lazy" });
    img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    return img;
  }
  return blankCover(book.title);
}
