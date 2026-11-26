export const MAX_CLIP = 10;
export const MIN_CLIP = 0.1;
export type Range = { start: number; end: number };

export function initialRange(total: number, maximum = MAX_CLIP): Range {
  return { start: 0, end: Math.min(total, maximum) };
}

export function rangeDuration(range: Range) {
  return Math.round((range.end - range.start) * 1_000_000) / 1_000_000;
}

export function moveBoundary(range: Range, side: keyof Range, value: number, total: number, maximum: number): Range {
  const minimum = Math.min(MIN_CLIP, total, maximum);
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const target = Number.isFinite(value) ? value : range[side];
  if (side === "start") {
    const start = clamp(target, 0, total - minimum);
    return { start, end: clamp(range.end, start + minimum, Math.min(total, start + maximum)) };
  }
  const end = clamp(target, minimum, total);
  return { start: clamp(range.start, Math.max(0, end - maximum), end - minimum), end };
}

export function capAudio(range: Range, offset: number, total: number) {
  const position = Math.max(0, Math.min(offset, total - MIN_CLIP));
  return { position, range: { start: range.start, end: Math.min(range.end, range.start + total - position) } };
}

export function timeLabel(seconds: number, precision = 0) {
  const scale = 10 ** precision;
  const ticks = Math.max(0, Math.round(seconds * scale));
  const minutes = Math.floor(ticks / (60 * scale));
  return `${String(minutes).padStart(2, "0")}:${((ticks % (60 * scale)) / scale).toFixed(precision).padStart(precision ? precision + 3 : 2, "0")}`;
}

export function frameSchedule(seconds: number, fps: number) {
  const ms = Math.round(seconds * 1000);
  const count = Math.max(1, Math.ceil(seconds * fps));
  return Array.from({ length: count }, (_, index) => {
    const at = Math.floor(index * ms / count);
    return { at, duration: Math.floor((index + 1) * ms / count) - at };
  });
}
