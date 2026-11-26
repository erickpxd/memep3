import { AUDIO_LIMIT } from "../shared/editor/media/browser-media";

const hosts = new Set(["myinstants.com", "www.myinstants.com"]);
const audioPath = /^\/media\/sounds\/[^/]+\.(mp3|ogg|wav)$/i;
const instantPath = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?instant\/[\w%.-]+\/?$/i;

function readUrl(value: string, base?: string) {
  const url = new URL(value.trim(), base);
  if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.port || url.username || url.password) {
    throw new Error("Use um link HTTPS do MyInstants.");
  }
  return url;
}

async function download(url: URL, maximum: number, signal: AbortSignal) {
  const response = await fetch(url, { credentials: "omit", redirect: "error", signal });
  if (!response.ok || !response.body) throw new Error("O MyInstants não retornou esse arquivo.");
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximum) throw new Error("O arquivo do MyInstants excede o tamanho permitido.");
      chunks.push(new Uint8Array(result.value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return new Blob(chunks, { type: response.headers.get("content-type") ?? "" });
}

export async function getInstantAudio(value: string) {
  let url = readUrl(value);
  url.hostname = "www.myinstants.com";
  url.search = "";
  url.hash = "";
  const signal = AbortSignal.timeout(20_000);

  if (instantPath.test(url.pathname)) {
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    const html = await download(url, 2 * 1024 * 1024, signal);
    const match = (await html.text()).match(/(?:https:\/\/(?:www\.)?myinstants\.com)?\/media\/sounds\/[^"'\s<>]+?\.(?:mp3|ogg|wav)(?=["'\s<>?)]|$)/i);
    if (!match) throw new Error("Áudio não encontrado. Tente o link direto do arquivo.");
    url = readUrl(match[0], url.href);
  }
  if (!audioPath.test(url.pathname)) throw new Error("Cole o link de um som do MyInstants ou do arquivo de áudio.");
  const audio = await download(url, AUDIO_LIMIT, signal);
  return new File([audio], decodeURIComponent(url.pathname.split("/").at(-1)!), { type: audio.type });
}
