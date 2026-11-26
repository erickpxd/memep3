import { MAX_CLIP, MIN_CLIP } from "./timing";
import type { Range } from "./timing";
import { SIDE } from "./webp";
import { mediaBox } from "./framing";
import type { Crop } from "./framing";

export const AUDIO_LIMIT = 25 * 1024 * 1024;
export const VISUAL_LIMIT = 250 * 1024 * 1024;
const IMAGE_LIMIT = 25 * 1024 * 1024;

type AudioTrackStatus = "available" | "missing" | "unsupported" | "unreadable";
export type Visual = {
  file: File;
  url: string;
  kind: "image" | "animation" | "video";
  mime: string;
  duration: number;
  width: number;
  height: number;
  originalAudio: AudioTrackStatus;
};
export const visualTypes = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov";
export const audioTypes = "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac";

export async function openVideo(url: string, signal?: AbortSignal) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await mediaEvent(video, "loadeddata", signal, () => { video.src = url; });
    return video;
  } catch (error) {
    releaseVideo(video);
    throw error;
  }
}

export function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

function mediaEvent(video: HTMLVideoElement, event: string, signal?: AbortSignal, begin?: () => void) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, success);
      video.removeEventListener("error", failure);
      signal?.removeEventListener("abort", abort);
    };
    const success = () => { cleanup(); resolve(); };
    const failure = () => { cleanup(); reject(new Error("O navegador não conseguiu ler esse vídeo. Tente MP4 com H.264.")); };
    const abort = () => { cleanup(); reject(signal?.reason); };
    const timer = setTimeout(failure, 12_000);
    video.addEventListener(event, success, { once: true });
    video.addEventListener("error", failure, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    try { begin?.(); }
    catch (error) { cleanup(); reject(error); }
  });
}

export async function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!video.readyState) await mediaEvent(video, "loadedmetadata", signal);
  const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : Infinity;
  const target = Math.min(Math.max(0, time), end);
  if (Math.abs(video.currentTime - target) < 0.001) {
    if (video.seeking) await mediaEvent(video, "seeked", signal);
    else if (video.readyState < 2) await mediaEvent(video, "loadeddata", signal);
    return;
  }
  await mediaEvent(video, "seeked", signal, () => { video.currentTime = target; });
}

export async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function detectVisual(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const text = new TextDecoder("ascii").decode(bytes);
  if (text.startsWith("GIF87a") || text.startsWith("GIF89a")) return { kind: "animation", mime: "image/gif" } as const;
  if (text.slice(8, 12) === "WEBP" && text.startsWith("RIFF")) {
    return { kind: text.slice(12, 16) === "VP8X" && (bytes[20] & 2) ? "animation" : "image", mime: "image/webp" } as const;
  }
  if (bytes[0] === 0x89 && text.slice(1, 4) === "PNG") return { kind: "image", mime: "image/png" } as const;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "image", mime: "image/jpeg" } as const;
  if (text.slice(4, 8) === "ftyp") return { kind: "video", mime: "video/mp4" } as const;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { kind: "video", mime: "video/webm" } as const;
  throw new Error("Escolha uma imagem PNG, JPG, GIF ou WebP, ou um vídeo MP4, MOV ou WebM.");
}

export async function readVisual(file: File): Promise<Visual> {
  if (file.size > VISUAL_LIMIT) throw new Error("Escolha um vídeo de até 250 MB.");
  const type = await detectVisual(file);
  if (type.kind !== "video" && file.size > IMAGE_LIMIT) throw new Error("Escolha uma imagem ou GIF de até 25 MB.");
  const url = URL.createObjectURL(new Blob([file], { type: type.mime }));
  try {
    let width: number;
    let height: number;
    let duration = MAX_CLIP;
    let originalAudio: AudioTrackStatus = "missing";
    if (type.kind === "video") {
      const video = await openVideo(url);
      width = video.videoWidth;
      height = video.videoHeight;
      duration = video.duration;
      releaseVideo(video);
      const { BlobSource, Input, MP4, QTFF, WEBM, MATROSKA } = await import("mediabunny");
      const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
      try {
        const track = await input.getPrimaryAudioTrack();
        if (!Number.isFinite(duration)) duration = await input.computeDuration();
        if (track) originalAudio = await track.canDecode() ? "available" : "unsupported";
      } catch {
        originalAudio = "unreadable";
      } finally {
        input.dispose();
      }
      if (!Number.isFinite(duration) || duration < MIN_CLIP || duration > 7_200) {
        throw new Error("O vídeo precisa ter entre 0,1 segundo e 2 horas.");
      }
    } else {
      const image = await loadImage(url);
      width = image.naturalWidth;
      height = image.naturalHeight;
      if (type.kind === "animation") {
        const { openAnimation } = await import("./animation");
        const reader = await openAnimation({ ...type, file, url, width, height, duration, originalAudio });
        duration = Math.max(MIN_CLIP, Math.min(MAX_CLIP, reader.duration));
        reader.close();
      }
    }
    if (!width || !height || width * height > 36_000_000 || Math.max(width, height) > 8192) {
      throw new Error("Use mídia de até 8.192 px por lado e 36 megapixels.");
    }
    return { file, url, ...type, duration, originalAudio, width, height };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function readAudio(file: File) {
  if (!file.size || file.size > AUDIO_LIMIT) throw new Error("Escolha um arquivo de áudio de até 25 MB.");
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > 180 || buffer.duration < MIN_CLIP) throw new Error("Escolha áudio entre 0,1 segundo e 3 minutos.");
    return buffer;
  } catch (error) {
    if (error instanceof DOMException) throw new Error("Não foi possível ler esse áudio. Tente um MP3, WAV ou M4A.");
    throw error;
  } finally {
    await context.close();
  }
}

export function waveform(buffer: AudioBuffer, count = 80) {
  const samples = buffer.getChannelData(0);
  const stride = samples.length / count;
  return Array.from({ length: count }, (_, index) => {
    let peak = 0;
    const step = Math.max(1, Math.floor(stride / 256));
    for (let sample = Math.floor(index * stride); sample < (index + 1) * stride; sample += step) {
      peak = Math.max(peak, Math.abs(samples[sample]));
    }
    return Math.max(0.03, peak);
  });
}

export function makeCanvas(width = SIDE, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não oferece suporte ao editor de imagem.");
  return { canvas, context };
}

export function paint(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, crop: Crop, solid = false) {
  const side = context.canvas.width;
  context.clearRect(0, 0, side, side);
  if (solid) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, side, side);
  }
  const box = mediaBox(width, height, crop);
  context.drawImage(source, box.left * side, box.top * side, box.width * side, box.height * side);
}

let nativeWebp = true;
let fallbackEncoder: Promise<typeof import("@jsquash/webp/encode.js").default> | undefined;

export async function canvasWebp(canvas: HTMLCanvasElement, quality: number) {
  if (nativeWebp) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob?.type === "image/webp") return new Uint8Array(await blob.arrayBuffer());
    nativeWebp = false;
  }
  fallbackEncoder ??= import("@jsquash/webp/encode.js").then(async ({ default: encode, init }) => {
    await init({ locateFile: (name: string) => new URL(`./codecs/${name}`, window.location.href).href });
    return encode;
  }).catch((error) => {
    fallbackEncoder = undefined;
    throw error;
  });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não oferece suporte ao editor de imagem.");
  const encode = await fallbackEncoder;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return new Uint8Array(await encode(context.getImageData(0, 0, canvas.width, canvas.height), {
    quality: quality * 100, method: 2,
  }));
}

export async function videoThumbnails(visual: Visual, signal: AbortSignal) {
  const video = await openVideo(visual.url, signal);
  const { canvas, context } = makeCanvas(120, 70);
  const images: string[] = [];
  try {
    for (let index = 0; index < 8; index++) {
      await seekVideo(video, visual.duration * (index + 0.5) / 8, signal);
      const fit = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = video.videoWidth * fit;
      const height = video.videoHeight * fit;
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      images.push(canvas.toDataURL("image/jpeg", 0.65));
    }
    return images;
  } finally {
    releaseVideo(video);
  }
}

const sampleRate = 48_000;
function sliceInto(target: AudioBuffer, input: AudioBuffer, inputStart: number, outputStart: number, seconds: number) {
  const outBase = Math.round(outputStart * sampleRate);
  const inBase = inputStart * input.sampleRate;
  const step = input.sampleRate / sampleRate;
  const begin = Math.max(0, -outBase, Math.ceil(-inBase / step));
  const end = Math.min(target.length - outBase, Math.ceil((input.length - inBase) / step), Math.round(seconds * sampleRate));
  for (let channel = 0; channel < target.numberOfChannels; channel++) {
    const to = target.getChannelData(channel);
    const from = input.getChannelData(Math.min(channel, input.numberOfChannels - 1));
    for (let i = begin; i < end; i++) {
      const at = inBase + i * step;
      const left = Math.floor(at);
      const fraction = at - left;
      to[outBase + i] = from[left] * (1 - fraction) + from[Math.min(left + 1, from.length - 1)] * fraction;
    }
  }
}

function audioBuffer(duration: number, channels: number) {
  return new AudioBuffer({ length: Math.max(1, Math.round(duration * sampleRate)), numberOfChannels: Math.min(2, channels), sampleRate });
}

export function replacementAudio(source: AudioBuffer, range: Range, offset: number, duration: number) {
  const result = audioBuffer(duration, source.numberOfChannels);
  sliceInto(result, source, range.start, offset, Math.max(0, Math.min(duration - offset, range.end - range.start)));
  return result;
}

export async function originalAudio(visual: Visual, range: Range, signal: AbortSignal) {
  const { AudioBufferSink, BlobSource, Input, MP4, QTFF, WEBM, MATROSKA } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(visual.file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  const dispose = () => input.dispose();
  signal.addEventListener("abort", dispose, { once: true });
  try {
    signal.throwIfAborted();
    const [track, video] = await Promise.all([input.getPrimaryAudioTrack(), input.getPrimaryVideoTrack()]);
    if (!track || !video || !(await track.canDecode())) throw new Error("Este vídeo não tem uma faixa de áudio compatível.");
    const first = await input.getFirstTimestamp();
    const start = range.start + first;
    const end = range.end + first;
    const result = audioBuffer(end - start, await track.getNumberOfChannels());
    const sink = new AudioBufferSink(track);
    const before = await sink.getBuffer(start);
    if (before && before.timestamp + before.duration > start) {
      sliceInto(result, before.buffer, start - before.timestamp, 0, before.timestamp + before.duration - start);
    }
    for await (const piece of sink.buffers(start, end)) {
      signal.throwIfAborted();
      sliceInto(result, piece.buffer, 0, piece.timestamp - start, piece.duration);
    }
    return result;
  } finally {
    signal.removeEventListener("abort", dispose);
    input.dispose();
  }
}
