"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipPlayer, Header, Heading, Icon, MediaThumb, PickFile, SecondInput, Thumbnails, Timeline, Wave } from "./controls";
import { audioTypes, originalAudio, readAudio, readVisual, replacementAudio, visualTypes, waveform } from "./media";
import type { Visual } from "./media";
import { centered } from "./framing";
import type { Crop } from "./framing";
import { FramingView, framingStyle } from "./framing-view";
import { useRecording } from "./recording";
import type { Rendered } from "./render";
import { saveVideoForImport } from "./share";
import { makeStickerPack, MAX_PACK_SIZE, MIN_PACK_SIZE } from "./sticker-pack";
import { capAudio, initialRange, MAX_CLIP, MIN_CLIP, rangeDuration, timeLabel } from "./timing";
import type { Range } from "./timing";

type Screen = "home" | "video" | "record" | "audio" | "preview" | "processing" | "success" | "pack" | "error";
type AudioMode = "original" | "replace" | "mute";
type Sound = { file: File; buffer: AudioBuffer; recorded: boolean };
type Output = Rendered & { stickerUrl: string; videoUrl?: string; videoFilename?: string };
type ResultType = "video" | "sticker";
type ResultFile = { blob: Blob; url: string; name: string };

const choices = [
  { mode: "original", icon: "music", title: "Manter áudio original", detail: "Usa o som que já está no vídeo." },
  { mode: "replace", icon: "switch", title: "Trocar áudio", detail: "Envie um áudio ou grave uma nova voz." },
  { mode: "mute", icon: "mute", title: "Sem áudio", detail: "Sua figurinha será criada sem som." },
] as const;

function problem(error: unknown, fallback: string) {
  return error instanceof Error && !(error instanceof DOMException) ? error.message : fallback;
}

function originalAudioHint(visual: Visual | undefined) {
  if (!visual || visual.kind !== "video") return "Selecione um vídeo com som para usar esta opção.";
  if (visual.originalAudio === "unsupported") return "O navegador não consegue decodificar o áudio deste vídeo.";
  if (visual.originalAudio === "unreadable") return "Não foi possível identificar a faixa de áudio deste vídeo.";
  return "Usa o som que já está no vídeo.";
}

function download(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
}

function DownloadResult({ file, chooseLocation, forWhatsApp = false }: { file: ResultFile; chooseLocation: boolean; forWhatsApp?: boolean }) {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const label = forWhatsApp ? "Salvar no WhatsApp" : "Baixar";
  const className = `button ${forWhatsApp ? "primary" : "outline"}`;
  const content = <>{!forWhatsApp && <Icon name="download" />}{label}</>;

  async function save() {
    setStatus("saving");
    try {
      const result = await saveVideoForImport(file.blob, file.name);
      if (result === "download") download(file.url, file.name);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return chooseLocation ? <>
    <button type="button" className={className} disabled={status === "saving"} onClick={() => void save()}>{content}</button>
    {status === "error" && <p className="hint" role="alert">Não foi possível salvar no local escolhido. Tente novamente.</p>}
  </> : <a className={className} href={file.url} download={file.name}>{content}</a>;
}

function Create({ onClick, disabled, label = "Criar minha figurinha" }: { onClick?: () => void; disabled?: boolean; label?: string }) {
  return <button className="button primary create" disabled={disabled} onClick={onClick}><Icon name="wand" />{label}</button>;
}

export default function Studio({ importLink }: { importLink?: (url: string) => Promise<File> }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [visual, setVisual] = useState<Visual>();
  const [crop, setCrop] = useState<Crop>(centered);
  const [videoRange, setVideoRange] = useState<Range>(initialRange(MAX_CLIP));
  const [mode, setMode] = useState<AudioMode>("replace");
  const [sound, setSound] = useState<Sound>();
  const [audioRange, setAudioRange] = useState<Range>(initialRange(MAX_CLIP));
  const [position, setPosition] = useState(0);
  const [prepared, setPrepared] = useState<AudioBuffer>();
  const [output, setOutput] = useState<Output>();
  const [pack, setPack] = useState<{ animated: boolean; stickers: Blob[] }>();
  const [packName, setPackName] = useState("Minhas figurinhas");
  const [packFile, setPackFile] = useState<string>();
  const [resultType, setResultType] = useState<ResultType>("sticker");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ value: 0, label: "" });
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");
  const audioChoices = visual?.kind === "video" && visual.originalAudio === "missing"
    ? choices.filter(({ mode }) => mode !== "original")
    : choices;
  const main = useRef<HTMLElement>(null);
  const previousScreen = useRef<Screen>("home");
  const job = useRef<AbortController | null>(null);
  const locked = useRef(false);

  const visualLimit = visual?.kind === "video" ? rangeDuration(videoRange) : visual?.duration ?? MAX_CLIP;
  const cut = capAudio(audioRange, position, visualLimit);
  const soundDuration = Math.max(MIN_CLIP, rangeDuration(cut.range));
  const duration = visual?.kind === "image" && mode === "replace" && sound ? Math.min(MAX_CLIP, cut.position + soundDuration) : visualLimit;
  const renderStart = visual?.kind === "video" ? videoRange.start : 0;
  const syncedReplacement = useMemo(
    () => mode === "replace" && sound
      ? replacementAudio(sound.buffer, { start: cut.range.start, end: cut.range.end }, cut.position, duration) : undefined,
    [sound, mode, cut.range.start, cut.range.end, cut.position, duration],
  );
  const replacementWave = useMemo(() => sound ? waveform(sound.buffer) : [], [sound]);
  const recorder = useRecording((file) => void importAudio(file, true));

  useEffect(() => () => { if (visual) URL.revokeObjectURL(visual.url); }, [visual]);
  useEffect(() => () => {
    if (output) {
      URL.revokeObjectURL(output.stickerUrl);
      if (output.videoUrl) URL.revokeObjectURL(output.videoUrl);
    }
  }, [output]);
  useEffect(() => () => job.current?.abort(), []);
  useEffect(() => () => { if (packFile) URL.revokeObjectURL(packFile); }, [packFile]);
  useEffect(() => {
    if (screen !== previousScreen.current) {
      previousScreen.current = screen;
      window.scrollTo(0, 0);
      main.current?.querySelector("h1")?.focus({ preventScroll: true });
    }
  }, [screen]);

  async function load(label: string, work: () => Promise<void>, fallback: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError("");
    try { await work(); }
    catch (cause) { setError(problem(cause, fallback)); }
    finally { locked.current = false; setBusy(""); }
  }

  async function importVisual(file: File) {
    await load("Abrindo mídia…", async () => {
      const selected = await readVisual(file);
      setVisual(selected);
      setCrop(centered);
      setVideoRange(initialRange(selected.duration));
      setPrepared(undefined);
      setOutput(undefined);
      setScreen(selected.kind === "video" ? "video" : "home");
      if (selected.originalAudio !== "available" && mode === "original") setMode("replace");
    }, "O arquivo não pôde ser aberto. Confira o formato e tente novamente.");
  }

  function useAudioFile(file: File, buffer: AudioBuffer, recorded: boolean) {
    setSound({ file, buffer, recorded });
    setAudioRange(initialRange(buffer.duration, visualLimit));
    setPosition(0);
    setMode("replace");
    setPrepared(undefined);
    setScreen("audio");
  }

  async function importAudio(file: File, recorded = false) {
    await load("Abrindo áudio…", async () => {
      useAudioFile(file, await readAudio(file), recorded);
    }, "Não foi possível ler esse áudio.");
  }

  useEffect(() => {
    if (screen !== "home") return;
    const paste = (event: ClipboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,[contenteditable]")) return;
      const file = event.clipboardData?.files[0];
      if (!file) return;
      event.preventDefault();
      void importVisual(file);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  function go(next: Screen) {
    if (screen === "record" && next !== "record") recorder.cancel();
    setError("");
    setScreen(next);
  }

  function reset() {
    job.current?.abort();
    recorder.cancel();
    setVisual(undefined);
    setSound(undefined);
    setOutput(undefined);
    setPrepared(undefined);
    setVideoRange(initialRange(MAX_CLIP));
    setAudioRange(initialRange(MAX_CLIP));
    setPosition(0);
    setMode("replace");
    go("home");
  }

  function addToPack() {
    if (!output || busy) return;
    setPackFile(undefined);
    go("pack");
    if (pack?.stickers.includes(output.sticker)) return;
    if (pack && pack.animated !== output.animated) {
      setError(pack.animated ? "O pacote atual aceita figurinhas animadas. A figurinha atual é estática." : "O pacote atual aceita figurinhas estáticas. A figurinha atual é animada.");
      return;
    }
    if (pack?.stickers.length === MAX_PACK_SIZE) {
      setError("O pacote está cheio. Baixe-o antes de iniciar outro.");
      return;
    }
    setPack({ animated: output.animated, stickers: [...(pack?.stickers ?? []), output.sticker] });
  }

  async function preparePack() {
    if (!pack) return;
    await load("Preparando o pacote…", async () => {
      const file = await makeStickerPack(packName, pack.animated, pack.stickers);
      setPackFile(URL.createObjectURL(file));
    }, "Não foi possível montar o pacote.");
  }

  function stopJob() {
    job.current?.abort();
    job.current = null;
    setBusy("");
    go("home");
  }

  async function preview() {
    if (busy || job.current) return;
    if (!visual) {
      setError("Selecione uma imagem, GIF ou vídeo para continuar.");
      return;
    }
    if (mode === "replace" && !sound) {
      setError("Envie ou grave um áudio, ou escolha Sem áudio.");
      return;
    }
    const controller = new AbortController();
    job.current = controller;
    setError("");
    setBusy(mode === "original" ? "Preparando o áudio original…" : "");
    try {
      const audio = mode === "original" ? await originalAudio(visual, videoRange, controller.signal) : syncedReplacement;
      controller.signal.throwIfAborted();
      setPrepared(audio);
      setScreen("preview");
    } catch (cause) {
      if (!controller.signal.aborted) setError(problem(cause, "Não foi possível sincronizar o áudio original. Escolha outro áudio ou siga sem som."));
    } finally {
      if (job.current === controller) {
        job.current = null;
        setBusy("");
      }
    }
  }

  async function generate() {
    if (!visual || job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setError("");
    setProgress({ value: 0, label: "Preparando sua mídia" });
    setScreen("processing");
    try {
      const { renderSticker } = await import("./render");
      const files = await renderSticker({
        visual, crop, start: renderStart, duration, audio: prepared, signal: controller.signal,
        onProgress: (value, label) => {
          if (!controller.signal.aborted) setProgress((current) => ({ value: Math.max(value, current.value), label }));
        },
      });
      controller.signal.throwIfAborted();
      const videoUrl = files.video && URL.createObjectURL(files.video);
      const videoFilename = files.video && `memep3${prepared ? "-com-audio" : ""}.${files.video.type.startsWith("video/mp4") ? "mp4" : "webm"}`;
      setOutput({ ...files, stickerUrl: URL.createObjectURL(files.sticker), videoUrl, videoFilename });
      setResultType("sticker");
      setScreen("success");
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(problem(cause, "Não foi possível converter esta mídia. Tente um arquivo menor ou um trecho mais curto."));
        setScreen("error");
      }
    } finally {
      if (job.current === controller) job.current = null;
    }
  }

  const back = () => go("home");
  const audioDescription = mode === "original" ? "Áudio original" : sound?.file.name ?? "Sem áudio";
  const videoFile = output?.video && output.videoUrl && output.videoFilename
    ? { blob: output.video, url: output.videoUrl, name: output.videoFilename }
    : undefined;
  const stickerFile = output ? { blob: output.sticker, url: output.stickerUrl, name: "memep3.webp" } : undefined;
  const resultFile = resultType === "video" ? videoFile ?? stickerFile : stickerFile;
  const stickerVisual = useMemo<Visual | undefined>(() => output ? {
    url: output.stickerUrl, file: new File([output.sticker], "memep3.webp", { type: "image/webp" }),
    mime: "image/webp", kind: output.animated ? "animation" : "image", duration: output.duration,
    width: 512, height: 512, originalAudio: "missing",
  } : undefined, [output]);

  const audioPicker = (label: string, className?: string) => <PickFile label={label} icon="upload" accept={audioTypes} className={className} onFile={(file) => void importAudio(file)} disabled={Boolean(busy)} />;
  const notice = <>{busy && <p className="hint" role="status">{busy}</p>}{error && <p className="inline-error" role="alert">{error}</p>}</>;

  return <div className="site">
    <Header />
    <main className="shell" ref={main}>
      {screen === "home" && <>
        <Heading title="Dê voz a sua figurinha!" detail="Adicione áudio às suas imagens e vídeos e transforme tudo em figurinha para compartilhar no WhatsApp" />
        <section className={`upload-area ${dragging ? "dragging" : ""} ${visual ? "filled" : ""}`} aria-label="Imagem ou vídeo"
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void importVisual(file);
          }}>
          {visual ? <MediaThumb visual={visual} /> : <><span className="bubble"><Icon name="media" /></span><h2>Sua figurinha começa aqui</h2><p>Envie uma imagem ou vídeo</p></>}
          <div className="button-row">
            <PickFile label={visual ? "Trocar arquivo" : "Selecionar arquivo"} accept={visualTypes} className="button blue pill" onFile={(file) => void importVisual(file)} disabled={Boolean(busy)} />
            {visual?.kind === "video" && <button className="button outline" onClick={() => go("video")}>Recortar vídeo</button>}
            {visual && <button className="button outline" onClick={() => { setVisual(undefined); if (mode === "original") setMode("replace"); setError(""); }}>Remover mídia</button>}
          </div>
          {!visual && <small>PNG, JPG, GIF, WebP, MP4, MOV ou WebM · imagens até 25 MB, vídeos até 250 MB</small>}
          {visual && visual.kind !== "video" && <div className="preview-figure framing-image">
            <h2>Enquadramento</h2>
            <FramingView visual={visual} crop={crop} onChange={setCrop}>
              <img src={visual.url} alt="Enquadramento atual" style={framingStyle(visual, crop)} />
            </FramingView>
          </div>}
        </section>

        {visual && <>
          <section className="audio-panel">
            <fieldset className="options">
              <legend>Áudio da figurinha</legend>
              <p>Como você quer utilizar o áudio?</p>
              <div className="option-grid" data-count={audioChoices.length}>
                {audioChoices.map((item) => <label className="audio-option" key={item.mode}>
                  <input type="radio" name="audio-mode" value={item.mode} checked={mode === item.mode} disabled={item.mode === "original" && visual?.originalAudio !== "available"}
                    onChange={() => { setMode(item.mode); setError(""); }} />
                  <Icon name={item.icon} /><span><strong>{item.title}</strong><small>{item.mode === "original" ? originalAudioHint(visual) : item.detail}</small></span>
                </label>)}
              </div>
            </fieldset>
            {mode === "replace" && <>
              {sound && <button className="button outline sound-file" onClick={() => go("audio")}><Icon name="music" />Editar {sound.file.name}</button>}
              <div className="two-actions">
                {audioPicker("Enviar áudio", "button outline vertical")}
                <button className="button outline vertical" disabled={Boolean(busy)} onClick={() => { go("record"); void recorder.start(Math.max(MIN_CLIP, visualLimit)); }}><Icon name="mic" />Gravar voz</button>
              </div>
              {importLink && <form className="link-form" onSubmit={(event) => {
                event.preventDefault();
                void load("Importando áudio…", async () => {
                  const file = await importLink(link);
                  useAudioFile(file, await readAudio(file), false);
                  setLink("");
                }, "Não foi possível importar esse link.");
              }}><input type="url" aria-label="Link do MyInstants" placeholder="Link do MyInstants" value={link} onChange={(event) => setLink(event.target.value)} />
                <button className="button outline" disabled={!link.trim() || Boolean(busy)}>Importar</button></form>}
            </>}
          </section>
          <Create disabled={Boolean(busy)} onClick={() => void preview()} />
        </>}
        {!visual && !busy && <p className="sr-only">Selecione uma imagem ou um vídeo para continuar.</p>}
        {notice}
      </>}

      {screen === "video" && visual && <>
        <Heading title="Recorte seu vídeo" detail="Escolha até 10 segundos para transformar em figurinha." onBack={back} />
        <section className="card edit-card">
          <h2>Enquadramento</h2>
          <ClipPlayer visual={visual} crop={crop} start={videoRange.start} duration={visualLimit} keepVideoAudio={mode === "original"} onCropChange={setCrop} />
          <Timeline label="Vídeo" total={visual.duration} maximum={MAX_CLIP} range={videoRange} onChange={setVideoRange}><Thumbnails visual={visual} /></Timeline>
          <Create label="Confirmar recorte" onClick={() => {
            setAudioRange(cut.range);
            setPosition(cut.position);
            go("home");
          }} />
        </section>
      </>}

      {screen === "record" && <>
        <Heading title="Dê voz a sua figurinha!" detail="Grave sua voz para deixar esse meme ainda mais seu." onBack={back} />
        {visual && <MediaThumb visual={visual} />}
        <section className="audio-panel detail-panel">
          <h2>Gravação de voz</h2>
          <div className="card record-card">
            <p className={recorder.status === "recording" ? "recording" : "hint"} role="status">{{
              recording: "● Gravando sua voz", paused: "Gravação pausada", requesting: "Aguardando acesso ao microfone…",
              finishing: "Finalizando gravação…", idle: "Microfone",
            }[recorder.status]}</p>
            <strong className="record-time">{timeLabel(recorder.elapsed)}</strong>
            <Wave peaks={recorder.peaks} />
            <small>{recorder.status === "recording" ? "Fale naturalmente. Estou ouvindo você." : `Você pode gravar até ${timeLabel(visualLimit)}.`}</small>
          </div>
          {(recorder.status === "recording" || recorder.status === "paused") && <div className="two-actions">
            <button className="button outline" onClick={recorder.pause}><Icon name={recorder.status === "paused" ? "play" : "pause"} />{recorder.status === "paused" ? "Retomar" : "Pausar"}</button>
            <button className="button primary" onClick={recorder.finish}><Icon name="stop" />Finalizar</button>
          </div>}
          <button className="button outline full" disabled={recorder.status === "requesting" || recorder.status === "finishing" || Boolean(busy)}
            onClick={() => void recorder.start(Math.max(MIN_CLIP, visualLimit))}><Icon name="redo" />{recorder.status === "idle" ? "Gravar voz" : "Regravar"}</button>
          <button className="button back" onClick={back}>Descartar gravação</button>
          {recorder.error && <p className="inline-error" role="alert">{recorder.error}</p>}
        </section>
        <Create disabled />
        <p className="hint center">Finalize a gravação para continuar.</p>
        {notice}
      </>}

      {screen === "audio" && sound && <>
        <Heading title="Dê voz a sua figurinha!" detail="Seu áudio já está aqui. Ouça antes de criar a figurinha." onBack={back} />
        {visual && <MediaThumb visual={visual} />}
        <section className="audio-panel detail-panel">
          <h2>Áudio da figurinha</h2>
          <div className="card audio-card">
            <strong className="filename">{sound.file.name}</strong>
            <small>Duração: {timeLabel(sound.buffer.duration)} · {sound.recorded ? "Gravação de voz" : "Áudio enviado"}</small>
            <ClipPlayer crop={crop} duration={soundDuration} audio={sound.buffer} audioStart={cut.range.start} title="Ouvir recorte" />
          </div>
          <div className="two-actions">
            {audioPicker("Substituir áudio")}
            <button className="button outline" onClick={() => { setSound(undefined); setMode("mute"); go("home"); }}><Icon name="trash" />Remover áudio</button>
          </div>
          <div className="card audio-cut">
            <h3>Recorte de áudio</h3>
            <Timeline label="Áudio" maximum={Math.max(MIN_CLIP, visualLimit - cut.position)} total={sound.buffer.duration} range={cut.range} onChange={setAudioRange}>
              <Wave peaks={replacementWave} range={cut.range} total={sound.buffer.duration} />
            </Timeline>
            <SecondInput label="Entrada na figurinha (s)" value={cut.position} maximum={Math.max(0, visualLimit - MIN_CLIP)} onChange={(offset) => {
              const next = capAudio(cut.range, offset, visualLimit);
              setPosition(next.position);
              setAudioRange(next.range);
            }} />
          </div>
          {visual && syncedReplacement && <details className="sync"><summary>Reproduzir com a mídia</summary><ClipPlayer visual={visual} crop={crop} start={renderStart} duration={duration} audio={syncedReplacement} /></details>}
        </section>
        <Create disabled={Boolean(busy)} onClick={() => void preview()} />
        {notice}
      </>}

      {screen === "preview" && visual && <>
        <Heading title="Prévia da figurinha" detail="Confira sua criação e dê o play para ouvir." onBack={back} />
        <div className="result-grid">
          <section className="card preview-card">
            <ClipPlayer visual={visual} crop={crop} start={renderStart} duration={duration} audio={prepared} caption="É assim que sua figurinha vai aparecer" />
          </section>
          <section className="card result-panel">
            <span className="badge"><Icon name="check" />Prévia pronta</span>
            <h2>Ficou a sua cara!</h2>
            <p>Confira a mídia e o recorte antes de gerar o arquivo.</p>
            <div className="result-info"><Icon name={prepared ? "music" : "mute"} /><div><strong>{prepared ? "Figurinha com áudio na prévia" : "Figurinha sem áudio"}</strong><small>{audioDescription} · {timeLabel(duration, 1)}</small></div></div>
            <Create onClick={() => void generate()} />
            <button className="button outline" onClick={back}>Voltar e editar</button>
          </section>
        </div>
      </>}

      {screen === "processing" && <>
        <Heading title={prepared ? "Seu meme está ganhando voz" : "Seu meme está ganhando forma"} detail={prepared ? "Estamos juntando sua imagem e seu áudio." : "Estamos gerando o WebP da sua figurinha."} onBack={stopJob} />
        <section className="card state-card">
          <Icon name="loading" />
          <h2>Preparando sua figurinha…</h2>
          <p>Mantenha esta tela aberta enquanto finalizamos.</p>
          <div className="state-content">
            <progress max={1} value={progress.value} aria-label="Progresso da geração" />
            <p className="progress-label" role="status">{Math.floor(progress.value * 100)}% · {progress.label}</p>
            <ol className="progress-steps">
              <li className={progress.value >= 0.72 ? "done" : "current"}>Preparar a figurinha</li>
              {prepared && <li className={progress.value >= 0.97 ? "done" : progress.value >= 0.72 ? "current" : ""}>Sincronizar o áudio</li>}
              <li className={progress.value >= 0.97 ? "current" : ""}>Validar arquivo final</li>
            </ol>
            <button className="button outline full" onClick={stopJob}>Cancelar processamento</button>
          </div>
        </section>
      </>}

      {screen === "success" && output && stickerVisual && resultFile && <>
        <Heading title="Sua figurinha está pronta!" detail="Veja como ficou e compartilhe a diversão." />
        <div className="result-grid">
          <section className="card preview-card">
            {resultType === "video" && videoFile
              ? <figure className="preview-figure"><video src={videoFile.url} controls playsInline preload="metadata" aria-label="Vídeo final" /><figcaption>{prepared ? "Vídeo com áudio" : "Vídeo sem áudio"}</figcaption></figure>
              : <ClipPlayer visual={stickerVisual} crop={centered} duration={output.duration} caption="É assim que sua figurinha vai aparecer" />}
            {videoFile && <div className="result-format">
              <label htmlFor="result-format">Formato para baixar</label>
              <select id="result-format" value={resultType} onChange={(event) => setResultType(event.currentTarget.value as ResultType)}>
                <option value="sticker">Figurinha WebP</option>
                <option value="video">{prepared ? "Vídeo com áudio" : "Vídeo sem áudio"}</option>
              </select>
            </div>}
          </section>
          <section className="card result-panel">
            <span className="badge"><Icon name="check" />Figurinha criada</span>
            <h2>Ficou a sua cara!</h2>
            <div className="result-info"><div><strong>{resultFile.name}</strong><small>{(resultFile.blob.size / 1000).toFixed(1)} KB{output.animated || resultType !== "sticker" ? ` · ${timeLabel(output.duration, 1)}` : ""}</small></div></div>
            {prepared && videoFile
              ? <DownloadResult file={videoFile} chooseLocation={videoFile.blob.type.startsWith("video/mp4")} forWhatsApp />
              : <button type="button" className="button primary" onClick={addToPack}>Salvar no WhatsApp</button>}
            <DownloadResult key={resultFile.url} file={resultFile} chooseLocation={Boolean(prepared && resultFile.blob.type.startsWith("video/mp4"))} />
            <button className="button outline" onClick={reset}>Criar outra figurinha</button>
            {prepared && videoFile && <p className="hint">Salve o vídeo e abra <strong>Figurinhas → Criar</strong> no WhatsApp. Selecione o vídeo e mantenha o áudio se o editor mostrar o ícone de som.</p>}
            {output.audioWarning && <p className="hint" role="status">{output.audioWarning}</p>}
          </section>
        </div>
      </>}

      {screen === "pack" && pack && <>
        <Heading title="Pacote para o WhatsApp" detail="Reúna de 3 a 30 figurinhas do mesmo tipo." onBack={busy ? undefined : () => go("success")} />
        <section className="card result-panel">
          <div className="result-info"><div><strong>{pack.stickers.length} de {MAX_PACK_SIZE} figurinhas</strong><small>{pack.animated ? "Pacote animado" : "Pacote estático"}</small></div></div>
          <label className="result-format">Nome do pacote<input value={packName} maxLength={128} disabled={Boolean(busy)} onChange={(event) => {
            setPackName(event.currentTarget.value);
            setPackFile(undefined);
          }} /></label>
          {notice}
          {packFile ? <>
            <a className="button primary" href={packFile} download="memep3.memep3pack"><Icon name="download" />Baixar pacote</a>
            <a className="button outline" href="memep3://importar">Abrir app MemeP3</a>
            <p className="hint">Com o app MemeP3 instalado, abra o arquivo baixado pelo botão Importar pacote e confirme no WhatsApp.</p>
            <button type="button" className="button outline" onClick={() => { setPack(undefined); setPackFile(undefined); reset(); }}>Iniciar outro pacote</button>
          </> : <>
            <button type="button" className="button primary" disabled={Boolean(busy) || pack.stickers.length < MIN_PACK_SIZE || !packName.trim()} onClick={() => void preparePack()}>Preparar pacote</button>
            <button type="button" className="button outline" disabled={Boolean(busy)} onClick={reset}>Criar outra figurinha</button>
            <button type="button" className="button outline" disabled={Boolean(busy)} onClick={() => { setPack(undefined); setPackFile(undefined); go("success"); }}>Esvaziar pacote</button>
          </>}
        </section>
      </>}

      {screen === "error" && <>
        <Heading title="Vamos tentar mais uma vez?" detail="Não deu certo desta vez, mas você não precisa começar do zero." onBack={back} />
        <section className="card state-card">
          <span className="bubble danger"><Icon name="alert" /></span>
          <h2>Não foi possível criar sua figurinha</h2>
          <p role="alert">{error}</p>
          <div className="state-content">
            <div className="result-info"><div><strong>O que você pode fazer</strong><small>Tente de novo ou volte ao editor para ajustar o trecho, a mídia ou o áudio.</small></div></div>
            <button className="button primary full" onClick={() => void generate()}><Icon name="redo" />Tentar novamente</button>
            <button className="button outline full" onClick={back}>Voltar ao editor</button>
          </div>
        </section>
      </>}
    </main>
  </div>;
}
