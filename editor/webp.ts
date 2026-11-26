import { MAX_CLIP } from "./timing";

export const SIDE = 512;
export const STATIC_LIMIT = 100_000;
export const ANIMATED_LIMIT = 500_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function tag(bytes: Uint8Array, offset: number) {
  return decoder.decode(bytes.subarray(offset, offset + 4));
}

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function put24(bytes: Uint8Array, offset: number, value: number) {
  bytes.set([value & 255, (value >> 8) & 255, (value >> 16) & 255], offset);
}

function join(parts: Uint8Array[]) {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function chunk(name: string, payload: Uint8Array) {
  const bytes = new Uint8Array(8 + payload.length + (payload.length % 2));
  bytes.set(encoder.encode(name));
  view(bytes).setUint32(4, payload.length, true);
  bytes.set(payload, 8);
  return bytes;
}

function riff(parts: Uint8Array[]) {
  return chunk("RIFF", join([encoder.encode("WEBP"), ...parts]));
}

function chunks(file: Uint8Array, start = 12) {
  if (start === 12 && (tag(file, 0) !== "RIFF" || tag(file, 8) !== "WEBP" || view(file).getUint32(4, true) !== file.length - 8)) {
    throw new Error("O arquivo gerado não é um WebP válido.");
  }
  const found: { name: string; data: Uint8Array; full: Uint8Array }[] = [];
  for (let i = start; i < file.length;) {
    if (i + 8 > file.length) throw new Error("O cabeçalho WebP está incompleto.");
    const length = view(file).getUint32(i + 4, true);
    const end = i + 8 + length + (length % 2);
    if (end > file.length) throw new Error("O arquivo WebP está incompleto.");
    found.push({ name: tag(file, i), data: file.subarray(i + 8, i + 8 + length), full: file.subarray(i, end) });
    i = end;
  }
  return found;
}

export function framePayload(file: Uint8Array) {
  const parts = chunks(file).filter(({ name }) => ["ALPH", "VP8 ", "VP8L"].includes(name));
  const image = parts.find(({ name }) => name === "VP8 " || name === "VP8L");
  if (!image) throw new Error("O navegador não gerou um quadro WebP.");
  return {
    bytes: join(parts.map(({ full }) => full)),
    alpha: parts.some(({ name }) => name === "ALPH") || (image.name === "VP8L" && Boolean(image.data[4] & 0x10)),
  };
}

export function muxAnimation(frames: { bytes: Uint8Array; alpha: boolean; duration: number }[], side = SIDE) {
  const header = new Uint8Array(10);
  header[0] = 0x02 | (frames.some((frame) => frame.alpha) ? 0x10 : 0);
  put24(header, 4, side - 1);
  put24(header, 7, side - 1);
  return riff([chunk("VP8X", header), chunk("ANIM", new Uint8Array(6)), ...frames.map((frame) => {
    const metadata = new Uint8Array(16);
    put24(metadata, 6, side - 1);
    put24(metadata, 9, side - 1);
    put24(metadata, 12, frame.duration);
    metadata[15] = 0x02; // Each frame fully replaces the previous canvas.
    return chunk("ANMF", join([metadata, frame.bytes]));
  })]);
}

export function inspectWebp(file: Uint8Array) {
  const parts = chunks(file);
  const extended = parts.find(({ name }) => name === "VP8X")?.data;
  const lossy = parts.find(({ name }) => name === "VP8 ")?.data;
  const lossless = parts.find(({ name }) => name === "VP8L")?.data;
  const frames = parts.filter(({ name }) => name === "ANMF");
  const durations = frames.map(({ data }) => u24(data, 12));
  const width = extended ? u24(extended, 4) + 1 : lossy ? view(lossy).getUint16(6, true) & 0x3fff : lossless ? (view(lossless).getUint32(1, true) & 0x3fff) + 1 : 0;
  const height = extended ? u24(extended, 7) + 1 : lossy ? view(lossy).getUint16(8, true) & 0x3fff : lossless ? ((view(lossless).getUint32(1, true) >> 14) & 0x3fff) + 1 : 0;
  return { width, height, durations, duration: durations.reduce((sum, duration) => sum + duration, 0) };
}

export function validateSticker(file: Uint8Array, animated: boolean) {
  const shape = inspectWebp(file);
  if (shape.width !== SIDE || shape.height !== SIDE ||
      file.length > (animated ? ANIMATED_LIMIT : STATIC_LIMIT) ||
      Boolean(shape.durations.length) !== animated ||
      (animated && (shape.durations.length < 2 || shape.duration > MAX_CLIP * 1000 || shape.durations.some((duration) => duration < 8)))) {
    throw new Error("O WebP gerado ficou fora dos limites para figurinhas do WhatsApp.");
  }
  return shape;
}

export function splitAnimation(file: Uint8Array) {
  return chunks(file).filter(({ name }) => name === "ANMF").map(({ data }) => {
    if (data.length < 24) throw new Error("Um quadro da animação está incompleto.");
    const width = u24(data, 6) + 1;
    const height = u24(data, 9) + 1;
    const parts = chunks(data, 16);
    const header = new Uint8Array(10);
    header[0] = parts.some(({ name }) => name === "ALPH") ? 0x10 : 0;
    put24(header, 4, width - 1);
    put24(header, 7, height - 1);
    return {
      x: u24(data, 0) * 2, y: u24(data, 3) * 2, width, height,
      duration: Math.max(10, u24(data, 12)),
      dispose: Boolean(data[15] & 1),
      replace: Boolean(data[15] & 2),
      image: riff([...header[0] ? [chunk("VP8X", header)] : [], ...parts.map((part) => part.full)]),
    };
  });
}
