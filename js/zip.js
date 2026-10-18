// zip.js — минимальное чтение ZIP (достаточно для EPUB). Без зависимостей:
// распаковка идёт встроенным в браузер DecompressionStream('deflate-raw').
// Файл EPUB приходит от пользователя и может быть испорчен или специально собран («бомба» из 300 МБ нулей в 300 КБ),
// поэтому: все смещения проверяются по длине файла, распаковка идёт потоком и обрывается на MAX_ENTRY байтах,
// а любая ошибка разбора превращается в понятное сообщение (tests/zip.test.mjs).

const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Наибольший размер одного распакованного файла внутри EPUB (глава, обложка). У настоящих книг самая большая глава — единицы мегабайт. */
export const MAX_ENTRY = 32 * 1024 * 1024;

export class ZipError extends Error {}

async function inflateRaw(bytes, limit = MAX_ENTRY) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        reader.cancel().catch(() => {});
        throw new ZipError("Файл внутри EPUB слишком велик после распаковки (повреждён или собран намеренно).");
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError("Не удалось распаковать файл внутри EPUB: данные повреждены.");
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function openZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  const dec = new TextDecoder("utf-8");
  const entries = new Map();
  const bad = () => new ZipError("Повреждён каталог ZIP.");

  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("Файл не похож на EPUB (не найден каталог ZIP).");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new ZipError("Архивы ZIP64 (больше 4 ГБ) не поддерживаются.");
  for (let n = 0; n < count; n++) {
    if (p < 0 || p + 46 > bytes.length || dv.getUint32(p, true) !== SIG_CD) throw bad();
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    if (p + 46 + nlen > bytes.length) throw bad();
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    entries.set(name, { method, csize, lho });
    p += 46 + nlen + elen + clen;
  }

  async function read(name) {
    const e = entries.get(name);
    if (!e) throw new ZipError(`В архиве нет файла ${name}`);
    if (e.lho + 30 > bytes.length || dv.getUint32(e.lho, true) !== SIG_LOCAL) throw new ZipError("Повреждён заголовок файла в ZIP.");
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    if (start + e.csize > bytes.length) throw new ZipError("Файл внутри EPUB обрезан: архив скачан не до конца.");
    const raw = bytes.subarray(start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method === 8) return inflateRaw(raw);
    throw new ZipError(`Неподдерживаемый способ сжатия ZIP: ${e.method}`);
  }

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    read,
    async text(name) {
      return dec.decode(await read(name));
    },
  };
}
