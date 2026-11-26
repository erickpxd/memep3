import { canvasWebp, loadImage, makeCanvas, openVideo, paint, releaseVideo, seekVideo } from "../media/browser-media";
import type { Visual } from "../media/browser-media";
import type { Crop } from "../media/framing";
import { openAnimation } from "../media/animation";
import { frameSchedule, MAX_CLIP, MIN_CLIP } from "../media/timing";
import { ANIMATED_LIMIT, framePayload, muxAnimation, SIDE, STATIC_LIMIT, validateSticker } from "./webp";

export type RenderRequest = {
  visual: Visual;
  crop: Crop;
  start: number;
  duration: number;
  audio?: AudioBuffer;
  signal: AbortSignal;
  onProgress: (value: number, label: string) => void;
};
export type Rendered = { sticker: Blob; video?: Blob; audioWarning?: string; duration: number; animated: boolean };

async function withFrames(
  request: RenderRequest,
  schedule: ReturnType<typeof frameSchedule>,
  accept: (frame: CanvasImageSource, width: number, height: number, index: number) => Promise<boolean | void>,
) {
  const { visual, signal, start } = request;
  if (visual.kind === "image") {
    const image = await loadImage(visual.url);
    for (let i = 0; i < schedule.length; i++) {
      signal.throwIfAborted();
      if (await accept(image, visual.width, visual.height, i) === false) break;
    }
    return;
  }
  if (visual.kind === "animation") {
    const animation = await openAnimation(visual);
    try {
      for (let i = 0; i < schedule.length; i++) {
        await animation.draw(start + schedule[i].at / 1000, signal);
        if (await accept(animation.canvas, visual.width, visual.height, i) === false) break;
      }
    } finally {
      animation.close();
    }
    return;
  }
  const { BlobSource, CanvasSink, Input, MP4, QTFF, WEBM, MATROSKA } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(visual.file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  const dispose = () => input.dispose();
  signal.addEventListener("abort", dispose, { once: true });
  let processed = 0;
  try {
    signal.throwIfAborted();
    const track = await input.getPrimaryVideoTrack();
    if (track && await track.canDecode()) {
      const first = await input.getFirstTimestamp();
      const trackStart = await track.getFirstTimestamp();
      const ratio = SIDE / Math.min(visual.width, visual.height);
      const factor = Math.min(1, ratio, 1600 / Math.max(visual.width, visual.height));
      const sink = new CanvasSink(track, { width: Math.max(1, Math.round(visual.width * factor)), poolSize: 2, alpha: true });
      const times = schedule.map(({ at }) => Math.max(trackStart, first + start + at / 1000));
      for await (const frame of sink.canvasesAtTimestamps(times)) {
        signal.throwIfAborted();
        if (!frame) break;
        const source = frame.canvas;
        if (await accept(source, source.width, source.height, processed++) === false) return;
      }
      if (processed === schedule.length) return;
    }
  } catch (error) {
    if (processed || signal.aborted) throw error;
  } finally {
    signal.removeEventListener("abort", dispose);
    input.dispose();
  }
  const video = await openVideo(visual.url, signal);
  try {
    for (let i = processed; i < schedule.length; i++) {
      await seekVideo(video, start + schedule[i].at / 1000, signal);
      if (await accept(video, video.videoWidth, video.videoHeight, i) === false) break;
    }
  } finally {
    releaseVideo(video);
  }
}

function stickerCanvas(crop: Crop) {
  const { canvas, context } = makeCanvas();
  let scratch: ReturnType<typeof makeCanvas> | undefined;
  return {
    canvas,
    draw(source: CanvasImageSource, width: number, height: number, resolution: number) {
      if (resolution === SIDE) {
        paint(context, source, width, height, crop);
        return;
      }
      if (scratch?.canvas.width !== resolution) scratch = makeCanvas(resolution);
      paint(scratch.context, source, width, height, crop);
      context.clearRect(0, 0, SIDE, SIDE);
      context.drawImage(scratch.canvas, 0, 0, SIDE, SIDE);
    },
  };
}

async function staticSticker(request: RenderRequest) {
  const { canvas, draw } = stickerCanvas(request.crop);
  let output: Uint8Array<ArrayBuffer> | undefined;
  await withFrames(request, [{ at: 0, duration: 100 }], async (source, width, height) => {
    for (const side of [512, 448, 384, 320, 256]) {
      draw(source, width, height, side);
      for (const quality of [0.92, 0.75, 0.5, 0.27]) {
        request.signal.throwIfAborted();
        const bytes = await canvasWebp(canvas, quality);
        if (bytes.length <= STATIC_LIMIT) {
          output = bytes;
          return;
        }
      }
    }
  });
  if (!output) throw new Error("A imagem continua maior que 100 KB. Tente uma imagem com menos detalhes.");
  validateSticker(output, false);
  return new Blob([output], { type: "image/webp" });
}

async function animatedSticker(request: RenderRequest) {
  const { canvas, draw } = stickerCanvas(request.crop);
  const attempts = [
    { fps: 15, side: 512, quality: 0.76 },
    { fps: 10, side: 512, quality: 0.48 },
    { fps: 8, side: 448, quality: 0.34 },
    { fps: 6, side: 384, quality: 0.24 },
    { fps: 4, side: 288, quality: 0.15 },
  ];
  let reported = 0;
  for (const [step, preset] of attempts.entries()) {
    const plan = frameSchedule(request.duration, Math.max(preset.fps, 2 / request.duration));
    const frames: { bytes: Uint8Array; alpha: boolean; duration: number }[] = [];
    let size = 44;
    await withFrames(request, plan, async (frame, width, height, index) => {
      draw(frame, width, height, preset.side);
      const data = framePayload(await canvasWebp(canvas, preset.quality));
      size += data.bytes.length + 24;
      reported = Math.max(reported, (step + (index + 1) / plan.length) / attempts.length);
      request.onProgress(0.05 + reported * 0.65, step ? "Otimizando o WebP" : "Criando os quadros da figurinha");
      if (size > ANIMATED_LIMIT) return false;
      frames.push({ ...data, duration: plan[index].duration });
    });
    if (frames.length === plan.length) {
      const file = muxAnimation(frames);
      validateSticker(file, true);
      return new Blob([file], { type: "image/webp" });
    }
  }
  throw new Error("A animação ainda ultrapassa 500 KB. Tente um recorte mais curto.");
}

async function exportVideo(request: RenderRequest, container: "mp4" | "webm") {
  const {
    AudioBufferSource, BufferTarget, canEncodeAudio, CanvasSource,
    getFirstEncodableVideoCodec, Mp4OutputFormat, Output, WebMOutputFormat,
    Input, BlobSource, MP4, WEBM,
  } = await import("mediabunny");
  const { audio } = request;
  const audioConfig = audio && { sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels, bitrate: 96_000 };
  const videoConfig = { width: SIDE, height: SIDE, bitrate: 1_400_000 };
  const mp4 = container === "mp4";
  const codec = await getFirstEncodableVideoCodec(mp4 ? ["avc"] : ["vp9", "vp8"], videoConfig);
  if (codec && mp4 && audioConfig && !(await canEncodeAudio("aac", audioConfig))) {
    const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
    request.signal.throwIfAborted();
    Reflect.set(globalThis, Symbol.for("@mediabunny/aac-encoder:workerUrl"), new URL("./codecs/mediabunny-aac-encoder.worker.js", window.location.href).href);
    registerAacEncoder();
  }
  if (!codec || (audioConfig && !(await canEncodeAudio(mp4 ? "aac" : "opus", audioConfig)))) {
    throw new Error("Este navegador não conseguiu gerar a versão em vídeo. O WebP continua disponível.");
  }

  const { canvas, context } = makeCanvas();
  const format = mp4 ? new Mp4OutputFormat() : new WebMOutputFormat();
  const target = new BufferTarget();
  const writer = new Output({ format, target });
  const image = new CanvasSource(canvas, { codec, bitrate: videoConfig.bitrate });
  const sound = audioConfig && new AudioBufferSource({ codec: mp4 ? "aac" : "opus", bitrate: audioConfig.bitrate });
  writer.addVideoTrack(image);
  if (sound) writer.addAudioTrack(sound);
  const cancel = () => { void writer.cancel().catch(() => {}); };
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    request.signal.throwIfAborted();
    await writer.start();
    if (audio && sound) {
      // Both codecs pad their final packet. Leave room for padding inside the selected interval.
      const packetSamples = mp4 ? 1024 : Math.round(audio.sampleRate * 0.02);
      const audioLength = Math.max(packetSamples, Math.floor(audio.length / packetSamples) * packetSamples - (mp4 ? 0 : packetSamples));
      const encodableAudio = new AudioBuffer({ length: audioLength, numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate });
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        encodableAudio.getChannelData(channel).set(audio.getChannelData(channel).subarray(0, audioLength));
      }
      await sound.add(encodableAudio);
      sound.close();
    }
    const frames = frameSchedule(request.duration, request.visual.kind === "image" ? 6 : audio ? 24 : 15);
    await withFrames(request, frames, async (source, width, height, index) => {
      paint(context, source, width, height, request.crop, true);
      const frame = frames[index];
      await image.add(frame.at / 1000, frame.duration / 1000);
      request.onProgress(0.72 + (index + 1) / frames.length * 0.25, "Codificando a versão em vídeo");
    });
    image.close();
    request.signal.throwIfAborted();
    await writer.finalize();
    if (!target.buffer?.byteLength) throw new Error("O vídeo gerado ficou vazio.");
    const blob = new Blob([target.buffer], { type: format.mimeType });
    const verification = new Input({ source: new BlobSource(blob), formats: [MP4, WEBM] });
    try {
      const [video, audioTrack, duration] = await Promise.all([
        verification.getPrimaryVideoTrack(), verification.getPrimaryAudioTrack(), verification.computeDuration(),
      ]);
      if (!video || Boolean(audioTrack) !== Boolean(audio) || await video.getDisplayWidth() !== SIDE || await video.getDisplayHeight() !== SIDE ||
          (audioTrack && await audioTrack.computeDuration() > request.duration + 0.002) ||
          Math.abs(duration - request.duration) > 0.015 || duration > MAX_CLIP + 0.002) {
        throw new Error("O vídeo exportado não passou na validação.");
      }
    } finally {
      verification.dispose();
    }
    return blob;
  } finally {
    request.signal.removeEventListener("abort", cancel);
    if (writer.state !== "finalized") await writer.cancel().catch(() => {});
  }
}

export async function renderSticker(request: RenderRequest): Promise<Rendered> {
  if (!Number.isFinite(request.duration) || request.duration < MIN_CLIP || request.duration > MAX_CLIP ||
      request.start < 0 || (request.visual.kind === "video" && request.start + request.duration > request.visual.duration + 0.001)) {
    throw new Error("Revise o recorte. A figurinha deve ter até 10 segundos.");
  }
  const animated = request.visual.kind !== "image";
  request.onProgress(0.02, "Preparando sua mídia");
  const sticker = animated ? await animatedSticker(request) : await staticSticker(request);
  request.signal.throwIfAborted();
  request.onProgress(0.72, request.audio ? "Sincronizando o áudio" : "Validando o arquivo");
  let video: Blob | undefined;
  let audioWarning: string | undefined;
  if (request.audio || animated) {
    try {
      video = await exportVideo(request, "mp4");
    } catch {
      request.signal.throwIfAborted();
      try {
        video = await exportVideo(request, "webm");
      } catch (error) {
        request.signal.throwIfAborted();
        audioWarning = error instanceof Error ? error.message : "A versão em vídeo não pôde ser criada.";
      }
    }
  }
  request.signal.throwIfAborted();
  request.onProgress(1, "Arquivos validados");
  return { sticker, video, audioWarning, duration: request.duration, animated };
}
