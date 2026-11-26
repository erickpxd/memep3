import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const { outputFiles } = await build({
  stdin: {
    contents: 'export * from "./editor/timing"; export * from "./editor/webp"; export * from "./editor/share"; export * from "./editor/framing";',
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
  },
  write: false,
  bundle: true,
  platform: "node",
  format: "esm",
});
const rules = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64"));

test("a descrição do compartilhamento usa o link configurado ou o provisório", () => {
  assert.equal(rules.shareDescription(""), "Feito no MemeP3 · https://memep3.vercel.app");
  assert.equal(rules.shareDescription("https://meus-memes.example/criar?ref=teste"), "Feito no MemeP3 · https://meus-memes.example/criar");
  assert.equal(rules.shareDescription("file:///tmp/meme"), "Feito no MemeP3 · https://memep3.vercel.app");
});

test("enquadramento mantém a proporção ao arrastar e reduzir o vídeo", () => {
  assert.deepEqual(rules.mediaBox(240, 160, rules.centered), { left: -0.25, top: 0, width: 1.5, height: 1 });
  const crop = { x: 0.625, y: 0.375, scale: 0.5 };
  assert.deepEqual(rules.mediaBox(240, 160, crop), { left: 0.25, top: 0.125, width: 0.75, height: 0.5 });
  const moved = rules.constrainCrop(240, 160, { ...crop, x: 4 });
  assert.equal(rules.mediaBox(240, 160, moved).left, 0.75);
});

test("recorta de 01:25 a 01:30 em um vídeo de dez minutos e limita a seleção", () => {
  let cut = rules.initialRange(600);
  cut = rules.moveBoundary(cut, "start", 85, 600, 10);
  cut = rules.moveBoundary(cut, "end", 90, 600, 10);
  assert.deepEqual(cut, { start: 85, end: 90 });
  assert.deepEqual(rules.moveBoundary(cut, "end", 102, 600, 10), { start: 92, end: 102 });
  assert.deepEqual(rules.moveBoundary(cut, "end", 800, 600, 10), { start: 590, end: 600 });
  assert.equal(rules.timeLabel(cut.start, 2), "01:25.00");
});

test("limita o áudio escolhido à duração e posição na animação", () => {
  assert.deepEqual(rules.capAudio({ start: 12, end: 17 }, 0, 5), {
    position: 0, range: { start: 12, end: 17 },
  });
  assert.deepEqual(rules.capAudio({ start: 12, end: 17 }, 2, 5), {
    position: 2, range: { start: 12, end: 15 },
  });
});

test("o arraste decimal preserva o limite exato de dez segundos", () => {
  for (const start of [1.123456789, 91.123456789, 200.129999999]) {
    const cut = rules.moveBoundary({ start: 0, end: 0.1 }, "start", start, 600, 10);
    assert.equal(rules.rangeDuration(cut), 0.1);
    assert.equal(rules.rangeDuration(rules.moveBoundary(cut, "end", start + 10, 600, 10)), 10);
  }
});

test("gera uma timeline com soma exata e duração dos quadros permitida", () => {
  const timeline = rules.frameSchedule(4.392, 15);
  assert.equal(timeline[0].at, 0);
  assert(timeline.every((frame) => frame.duration >= 8));
  assert.equal(timeline.at(-1).at + timeline.at(-1).duration, 4392);
});

test("empacota e valida a animação conforme limites do WhatsApp", () => {
  const dummy = new Uint8Array(14);
  dummy.set(new TextEncoder().encode("VP8L"), 0);
  const bytes = new DataView(dummy.buffer);
  bytes.setUint32(4, 5, true);
  dummy[8] = 0x2f;
  const frames = [
    { bytes: dummy, alpha: true, duration: 100 },
    { bytes: dummy, alpha: true, duration: 250 },
  ];
  const file = rules.muxAnimation(frames);
  const result = rules.validateSticker(file, true);
  assert.deepEqual(result, { width: 512, height: 512, durations: [100, 250], duration: 350 });
  assert.equal(rules.splitAnimation(file).length, 2);
  assert.throws(() => rules.validateSticker(rules.muxAnimation(frames, 256), true), /limites/);
  assert.throws(() => rules.validateSticker(rules.muxAnimation([{ ...frames[0], duration: 10_000 }, frames[1]]), true), /limites/);
  assert.throws(() => rules.validateSticker(rules.muxAnimation([{ ...frames[0], duration: 7 }, frames[1]]), true), /limites/);
  assert.throws(() => rules.validateSticker(rules.muxAnimation(frames.map(frame => ({ ...frame, bytes: new Uint8Array(251_000) }))), true), /limites/);
});

test("o compartilhamento do cabeçalho contém só o link e o cancelamento não copia", async (context) => {
  const calls = [];
  const setNavigator = (value) => Object.defineProperty(globalThis, "navigator", { configurable: true, value });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  context.after(() => Object.defineProperty(globalThis, "navigator", descriptor));
  setNavigator({ share: (data) => calls.push(data) });
  assert.equal(await rules.shareSite("https://memep3.example/#estado"), "shared");
  assert.equal(calls[0].url, "https://memep3.example/");
  assert(!("files" in calls[0]));
  setNavigator({
    share() { throw new DOMException("cancelado", "AbortError"); },
    clipboard: { writeText: (url) => calls.push(url) },
  });
  assert.equal(await rules.shareSite("https://memep3.example/"), "cancelled");
  assert.equal(calls.length, 1);
  setNavigator({ clipboard: { writeText: (url) => calls.push(url) } });
  assert.equal(await rules.shareSite("https://memep3.example/"), "copied");
  assert.equal(calls[1], "https://memep3.example/");
});

test("arquivo só é compartilhado quando o sistema suporta esse tipo", async (context) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  context.after(() => Object.defineProperty(globalThis, "navigator", descriptor));
  const calls = [];
  const file = new File(["x"], "memep3.webp", { type: "image/webp" });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    canShare: () => true, share: (data) => calls.push(data),
  } });
  assert.equal(await rules.shareFile(file), "shared");
  assert.deepEqual(calls[0].files, [file]);
  assert.equal(calls[0].text, rules.shareDescription());
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { canShare: () => false } });
  assert.equal(await rules.shareFile(file), "download");
});
