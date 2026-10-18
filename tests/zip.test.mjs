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

// ── Испорченные и намеренно собранные архивы: понятное сообщение вместо падения или зависания ──
import { deflateRawSync } from "node:zlib";
import { ZipError, MAX_ENTRY } from "../js/zip.js";

/** Собирает ZIP в памяти. files: [имя, Buffer, способ (0 или 8)] */
function makeZip(files, { badCdOffset, badLho, truncateAt } = {}) {
  const parts = [];
  const cd = [];
  let off = 0;
  for (const [name, data, method = 8] of files) {
    const body = method === 8 ? deflateRawSync(data) : data;
    const nm = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nm.length, 28);
    c.writeUInt32LE(badLho ?? off, 42);
    cd.push(c, nm);
    off += 30 + nm.length + body.length;
  }
  const cdBuf = Buffer.concat(cd);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(badCdOffset ?? off, 16);
  let all = Buffer.concat([...parts, cdBuf, end]);
  if (truncateAt) all = all.subarray(0, truncateAt);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

test("zip: нормальный архив читается (сжатые и несжатые файлы)", async () => {
  const z = await openZip(makeZip([["a.txt", Buffer.from("привет"), 8], ["b.txt", Buffer.from("world"), 0]]));
  assert.equal(await z.text("a.txt"), "привет");
  assert.equal(await z.text("b.txt"), "world");
  assert.ok(z.has("a.txt") && !z.has("c.txt"));
});

test("zip: не архив, пустой файл, обрезанный каталог → ZipError с понятным текстом", async () => {
  for (const buf of [new ArrayBuffer(0), new ArrayBuffer(10), new TextEncoder().encode("not a zip at all, just some text of enough length").buffer]) {
    await assert.rejects(() => openZip(buf), (e) => e instanceof ZipError && /не похож на EPUB/.test(e.message));
  }
});

test("zip: смещение каталога и локального заголовка за пределами файла не даёт RangeError", async () => {
  const files = [["a.txt", Buffer.from("x".repeat(100))]];
  await assert.rejects(() => openZip(makeZip(files, { badCdOffset: 5_000_000 })), (e) => e instanceof ZipError && /каталог/.test(e.message));
  const z = await openZip(makeZip(files, { badLho: 9_000_000 }));
  await assert.rejects(() => z.text("a.txt"), (e) => e instanceof ZipError && /заголовок/.test(e.message));
  await assert.rejects(() => z.text("nope.txt"), (e) => e instanceof ZipError && /нет файла/.test(e.message));
});

test("zip: данные обрезаны — понятная ошибка, а не пустой файл", async () => {
  const full = makeZip([["a.txt", Buffer.from("y".repeat(5000))]]);
  const z = await openZip(full);
  assert.equal((await z.text("a.txt")).length, 5000);
  // в каталоге размер больше, чем есть в файле
  const buf = Buffer.from(full);
  buf.writeUInt32LE(900000, buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 20);
  const z2 = await openZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  await assert.rejects(() => z2.text("a.txt"), (e) => e instanceof ZipError && /обрезан/.test(e.message));
});

test("zip: повреждённые сжатые данные → ZipError", async () => {
  const buf = Buffer.from(makeZip([["a.txt", Buffer.from("z".repeat(2000))]]));
  for (let i = 40; i < 50; i++) buf[i] = 0xff; // портим начало потока deflate
  const z = await openZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  await assert.rejects(() => z.text("a.txt"), (e) => e instanceof ZipError && /повреждены/.test(e.message));
});

test("zip: «бомба» (много нулей в малом архиве) обрывается на пределе, а не заполняет память", async () => {
  const bomb = Buffer.alloc(MAX_ENTRY + 4 * 1024 * 1024); // чуть больше предела; deflate сожмёт до ~60 КБ
  const z = await openZip(makeZip([["bomb.txt", bomb]]));
  await assert.rejects(() => z.read("bomb.txt"), (e) => e instanceof ZipError && /слишком велик/.test(e.message));
});
