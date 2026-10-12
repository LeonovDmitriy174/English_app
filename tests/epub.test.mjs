import test from "node:test";
import assert from "node:assert/strict";
import { fixSelfClosing, selectChapters, EPUB_PARSER } from "../js/epub.js";

test("самозакрытые теги, которые HTML-разбор считает открывающими, разворачиваются в пары", () => {
  assert.equal(fixSelfClosing("<head><title/></head>"), "<head><title></title></head>");
  assert.equal(fixSelfClosing('<script type="text/javascript" src="a.js"/>'), '<script type="text/javascript" src="a.js"></script>');
  assert.equal(fixSelfClosing('<style type="text/css" />'), '<style type="text/css"></style>');
  assert.equal(fixSelfClosing('<a id="ch1"/><p>Text</p>'), '<a id="ch1"></a><p>Text</p>');
  assert.equal(fixSelfClosing('<div class="x"/>'), '<div class="x"></div>');
  assert.equal(fixSelfClosing('<a href="a/b/c.html"/>'), '<a href="a/b/c.html"></a>');
});

test("пустые теги HTML остаются как есть", () => {
  for (const s of ["<br/>", "<br />", "<BR/>", '<img src="a.png"/>', '<meta charset="utf-8"/>', '<link rel="stylesheet" href="s.css"/>', "<hr/>"]) assert.equal(fixSelfClosing(s), s);
});

test("обычная разметка не меняется", () => {
  const s = '<html><head><title>Chapter</title></head><body><p class="a">He said "yes" &amp; left.</p><p>1 < 2 > 0</p></body></html>';
  assert.equal(fixSelfClosing(s), s);
});

test("версия разбора задана числом: по ней книги разбираются заново", () => {
  assert.ok(Number.isInteger(EPUB_PARSER) && EPUB_PARSER >= 3);
});

const ch = (title, chars) => ({ title, chars, href: `${title}.xhtml` });
const titles = (list) => selectChapters(list).map((c) => c.title);

test("короткая глава посреди книги остаётся, служебные страницы по краям уходят", () => {
  const book = [ch("Dedication", 300), ch("Chapter 1", 5000), ch("Chapter 2", 1200), ch("Chapter 3", 6000), ch("Epilogue", 900)];
  assert.deepEqual(titles(book), ["Chapter 1", "Chapter 2", "Chapter 3", "Epilogue"]);
});

test("обложка, оглавление и «об авторе» не попадают в главы", () => {
  const book = [ch("Cover", 20), ch("Title Page", 80), ch("Contents", 700), ch("One", 3000), ch("Two", 4000), ch("About the Author", 400), ch("Also by Jane Doe", 300)];
  assert.deepEqual(titles(book), ["One", "Two"]);
  assert.deepEqual(titles([ch("One", 3000), ch("Contents", 2500), ch("Two", 4000)]), ["One", "Two"], "длинное оглавление посреди книги тоже убирается по названию");
});

test("короткий пролог в начале и «Глава» в конце остаются, а чужие короткие страницы нет", () => {
  const book = [ch("Maps", 400), ch("Prologue", 800), ch("Chapter 1", 5000), ch("Chapter 2", 5000), ch("CHAPTER 3", 700), ch("Acknowledgments", 900), ch("Praise for the book", 600)];
  assert.deepEqual(titles(book), ["Prologue", "Chapter 1", "Chapter 2", "CHAPTER 3"]);
});

test("пустые страницы и разделители частей посреди книги не становятся главами", () => {
  const book = [ch("One", 4000), ch("", 0), ch("PART TWO", 40), ch("Interlude", 600), ch("Three", 4000)];
  assert.deepEqual(titles(book), ["One", "Interlude", "Three"]);
});

test("сборник коротких рассказов: настоящих глав нет, остаётся всё, что не служебное", () => {
  const fables = [ch("Contents", 500), ch("The Fox and the Grapes", 600), ch("The Crow", 450), ch("The Hare and the Tortoise", 900), ch("Blank", 30)];
  assert.deepEqual(titles(fables), ["The Fox and the Grapes", "The Crow", "The Hare and the Tortoise"]);
  const tiny = [ch("a", 20), ch("b", 40)];
  assert.deepEqual(titles(tiny), ["a", "b"], "если отобрать нечего, остаётся всё как есть: книга не должна стать пустой");
  assert.deepEqual(selectChapters([]), []);
});

test("обычная книга без особенностей разбирается как раньше", () => {
  const book = [ch("1. The Boy Who Lived", 9000), ch("2. The Vanishing Glass", 8000), ch("3. The Letters", 7000)];
  assert.deepEqual(titles(book), book.map((c) => c.title));
});
