import { makeCanvas } from "./media";
import type { Visual } from "./media";
import { splitAnimation } from "./webp";

type Patch = { x: number; y: number; width: number; height: number; duration: number; disposal: number; replace: boolean; draw(ctx: CanvasRenderingContext2D): Promise<void> };

export async function openAnimation(visual: Visual) {
  if (visual.width * visual.height > 8_000_000) throw new Error("Use animações de até 8 megapixels.");
  const { canvas, context } = makeCanvas(visual.width, visual.height);
  const bytes = await visual.file.arrayBuffer();
  let patches: Patch[];
  if (visual.mime === "image/gif") {
    const { parseGIF, decompressFrame } = await import("gifuct-js");
    const gif = parseGIF(bytes);
    patches = gif.frames.filter((frame) => "image" in frame).map((frame) => {
      const { left: x, top: y, width, height } = frame.image.descriptor;
      return {
        x, y, width, height, duration: Math.max(20, (frame.gce?.delay || 10) * 10),
        disposal: frame.gce?.extras.disposal ?? 0, replace: false,
        async draw(target) {
          const { patch } = decompressFrame(frame, gif.gct, true);
          const buffer = makeCanvas(width, height);
          buffer.context.putImageData(new ImageData(new Uint8ClampedArray(patch), width, height), 0, 0);
          target.drawImage(buffer.canvas, x, y);
          buffer.canvas.width = 0;
        },
      };
    });
  } else {
    patches = splitAnimation(new Uint8Array(bytes)).map((frame) => ({
      ...frame, disposal: frame.dispose ? 2 : 0,
      async draw(target) {
        const image = await createImageBitmap(new Blob([frame.image], { type: "image/webp" }));
        try { target.drawImage(image, frame.x, frame.y); } finally { image.close(); }
      },
    }));
  }
  if (!patches.length ||
      patches.some(({ x, y, width, height }) => width < 1 || height < 1 || x + width > visual.width || y + height > visual.height)) {
    throw new Error("A animação é muito grande ou contém quadros inválidos.");
  }

  let total = 0;
  const boundaries = patches.map(({ duration }) => total += duration);
  let current = -1;
  let saved: ImageData | undefined;
  return {
    canvas,
    duration: total / 1000,
    async draw(seconds: number, signal?: AbortSignal) {
      const time = (seconds * 1000) % total;
      let index = boundaries.findIndex((end) => time < end);
      if (index < 0) index = patches.length - 1;
      if (index < current) {
        current = -1;
        saved = undefined;
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      while (current < index) {
        signal?.throwIfAborted();
        const last = patches[current];
        if (last?.disposal === 2) context.clearRect(last.x, last.y, last.width, last.height);
        if (last?.disposal === 3 && saved) context.putImageData(saved, last.x, last.y);
        const next = patches[++current];
        saved = next.disposal === 3 ? context.getImageData(next.x, next.y, next.width, next.height) : undefined;
        if (next.replace) context.clearRect(next.x, next.y, next.width, next.height);
        await next.draw(context);
      }
    },
    close() { canvas.width = canvas.height = 0; },
  };
}
