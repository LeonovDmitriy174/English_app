import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { openZip } from "../js/zip.js";

// Тест на реальной книге запускается, только если путь передан в переменной EPUB.
const epubPath = process.env.EPUB;

test("чтение EPUB: каталог, container.xml и глава", { skip: !epubPath || !existsSync(epubPath) }, async () => {
  const buf = readFileSync(epubPath);
  const zip = await openZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.ok(zip.has("META-INF/container.xml"));
  const container = await zip.text("META-INF/container.xml");
  assert.match(container, /full-path="([^"]+\.opf)"/);
  const chapter = await zip.text("OEBPS/content_2.html");
  assert.match(chapter, /THE VANISHING GLASS/);
  assert.match(chapter, /Nearly ten years had passed/);
});
