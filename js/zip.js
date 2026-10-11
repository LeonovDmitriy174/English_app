// zip.js — минимальное чтение ZIP (достаточно для EPUB). Без зависимостей:
// распаковка идёт встроенным в браузер DecompressionStream('deflate-raw').

const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function openZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Файл не похож на EPUB (не найден каталог ZIP).");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder("utf-8");
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== SIG_CD) throw new Error("Повреждён каталог ZIP.");
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    entries.set(name, { method, csize, lho });
    p += 46 + nlen + elen + clen;
  }

  async function read(name) {
    const e = entries.get(name);
    if (!e) throw new Error(`В архиве нет файла ${name}`);
    if (dv.getUint32(e.lho, true) !== SIG_LOCAL) throw new Error("Повреждён заголовок файла в ZIP.");
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    const raw = bytes.subarray(start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method === 8) return inflateRaw(raw);
    throw new Error(`Неподдерживаемый способ сжатия ZIP: ${e.method}`);
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
