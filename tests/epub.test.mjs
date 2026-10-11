import test from "node:test";
import assert from "node:assert/strict";
import { fixSelfClosing, EPUB_PARSER } from "../js/epub.js";

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
  assert.ok(Number.isInteger(EPUB_PARSER) && EPUB_PARSER >= 2);
});
