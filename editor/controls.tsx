"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { loadImage, paint, seekVideo, videoThumbnails, waveform } from "./media";
import type { Visual } from "./media";
import type { Crop } from "./framing";
import { FramingView, framingStyle } from "./framing-view";
import { moveBoundary, timeLabel } from "./timing";
import type { Range } from "./timing";
import { shareSite } from "./share";

export function Icon({ name, size }: { name: string; size?: number }) {
  return <img src={`./icons/${name}.svg`} alt="" className="icon" style={size ? { maxWidth: size, maxHeight: size } : undefined} />;
}

export function Header() {
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function share() {
    setManual("");
    setStatus("");
    window.clearTimeout(timer.current);
    try {
      const response = await shareSite(window.location.href);
      if (response === "copied") setStatus("Link copiado");
      else if (response.startsWith("http")) setManual(response);
      timer.current = window.setTimeout(() => setStatus(""), 2600);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Não foi possível compartilhar agora.");
    }
  }

  return <header className="topbar">
    <img className="brand" src="./logo-header.png" alt="MemeP3" />
    <div className="header-action">
      <button className="button share" onClick={() => void share()}><Icon name="share" />Compartilhar</button>
      <span className={status ? "share-note" : "sr-only"} role="status">{status}</span>
      {manual && <label className="share-note">Copie o link<input readOnly value={manual} onFocus={(event) => event.target.select()} /></label>}
    </div>
  </header>;
}

export function Heading({ title, detail, onBack, backLabel = "Voltar ao editor" }: { title: string; detail: string; onBack?: () => void; backLabel?: string }) {
  return <div className="heading">
    {onBack && <button className="back" onClick={onBack}><span aria-hidden="true">←</span> {backLabel}</button>}
    <h1 tabIndex={-1}>{title}</h1>
    <p>{detail}</p>
  </div>;
}

export function PickFile({ label, accept, onFile, icon, className = "button outline", disabled }: {
  label: string; accept: string; onFile: (file: File) => void; icon?: string; className?: string; disabled?: boolean;
}) {
  return <label className={className}>
    {icon && <Icon name={icon} />}
    {label}
    <input className="file-input" type="file" aria-label={label} accept={accept} disabled={disabled} onChange={(event) => {
      const selected = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (selected) onFile(selected);
    }} />
  </label>;
}

export function Wave({ peaks, range, total = 1 }: { peaks: number[]; range?: Range; total?: number }) {
  return <div aria-hidden="true" className="wave">
    {peaks.map((peak, index) => {
      const time = (index + 0.5) * total / peaks.length;
      return <i key={index} className={!range || (range.start <= time && time <= range.end) ? "active" : ""} style={{ height: `${Math.max(7, peak * 100)}%` }} />;
    })}
  </div>;
}

export function Timeline({ total, maximum, range, onChange, children, label }: {
  total: number; maximum: number; range: Range; onChange: (value: Range) => void; children: ReactNode; label: string;
}) {
  const minimum = Math.min(total, 0.1);
  const percent = (seconds: number) => `${(seconds / total * 100).toFixed(4)}%`;
  const change = (side: keyof Range, value: number) => onChange(moveBoundary(range, side, value, total, maximum));
  return <fieldset className="timeline">
    <legend>{label}</legend>
    <div className="timeline-track">
      {children}
      <span className="timeline-window" aria-hidden="true" style={{ left: percent(range.start), right: percent(total - range.end) }} />
      <input className="handle start" type="range" aria-label={`Início do recorte de ${label.toLowerCase()}`} aria-valuetext={timeLabel(range.start, 2)} min={0} max={total} step="any" value={range.start}
        onChange={(event) => change("start", Number(event.currentTarget.value))} onKeyDown={(event) => {
          const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? 0.1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -0.1 : 0;
          if (delta) { event.preventDefault(); change("start", range.start + delta); }
        }} />
      <input className="handle end" type="range" aria-label={`Fim do recorte de ${label.toLowerCase()}`} aria-valuetext={timeLabel(range.end, 2)} min={0} max={total} step="any" value={range.end}
        onChange={(event) => change("end", Number(event.currentTarget.value))} onKeyDown={(event) => {
          const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? 0.1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -0.1 : 0;
          if (delta) { event.preventDefault(); change("end", range.end + delta); }
        }} />
    </div>
    <div className="time-scale" aria-hidden="true"><span>{timeLabel(0)}</span><span>{timeLabel(total)}</span></div>
    <div className="time-controls">
      <SecondInput label="Início (s)" value={range.start} maximum={Math.max(0, total - minimum)} onChange={(seconds) => change("start", seconds)} />
      <SecondInput label="Fim (s)" value={range.end} maximum={total} minimum={minimum} onChange={(seconds) => change("end", seconds)} />
      <output>Duração <strong>{timeLabel(range.end - range.start, 2)}</strong></output>
    </div>
  </fieldset>;
}

export function SecondInput({ label, value, maximum, minimum = 0, onChange }: {
  label: string; value: number; maximum: number; minimum?: number; onChange: (value: number) => void;
}) {
  const rounded = (n: number) => String(Number(n.toFixed(2)));
  const [draft, setDraft] = useState<string>();
  return <label className="seconds">{label}
    <input type="number" inputMode="decimal" min={minimum} max={maximum} step="0.01" value={draft ?? rounded(value)}
      onChange={(event) => setDraft(event.currentTarget.value)} onBlur={() => {
        if (draft && Number.isFinite(Number(draft))) onChange(Math.min(maximum, Math.max(minimum, Number(draft))));
        setDraft(undefined);
      }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  </label>;
}

export function Thumbnails({ visual }: { visual: Visual }) {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void videoThumbnails(visual, controller.signal).then(setFrames).catch(() => {});
    return () => controller.abort();
  }, [visual]);
  return <div className="thumbnails" aria-hidden="true">
    {frames.map((src, index) => <img key={index} src={src} alt="" />)}
  </div>;
}

export function MediaThumb({ visual }: { visual: Visual }) {
  return <section className="media-summary">
    {visual.kind === "video" ? <video src={visual.url} preload="metadata" muted playsInline aria-label="Vídeo selecionado" /> : <img src={visual.url} alt="Mídia selecionada" />}
    <div><h2>Seu meme</h2><p className="filename">{visual.file.name}</p><small>{visual.kind === "video" ? "Vídeo selecionado" : "Imagem selecionada"}</small></div>
  </section>;
}

export function ClipPlayer({ visual, crop, start = 0, duration, audio, audioStart = 0, title = "Áudio da figurinha", caption, keepVideoAudio = false, onCropChange }: {
  visual?: Visual; crop: Crop; start?: number; duration: number; audio?: AudioBuffer; audioStart?: number; title?: string; caption?: string; keepVideoAudio?: boolean;
  onCropChange?: (crop: Crop) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const session = useRef<{ cancel(): void } | null>(null);
  const elapsedTime = useRef(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const peaks = useMemo(() => audio ? waveform(audio, 58) : [], [audio]);
  const animationCrop = visual?.kind === "animation" ? crop : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setTime(0);
    elapsedTime.current = 0;
    setPlaying(false);
    setError("");
    if (video.current) void seekVideo(video.current, start, controller.signal).catch(() => {});
    const layer = canvas.current?.getContext("2d");
    if (layer && animationCrop && visual?.kind === "animation") {
      void (async () => {
        try {
          const animation = await (await import("./animation")).openAnimation(visual);
          try {
            await animation.draw(0, controller.signal);
            if (!controller.signal.aborted && !session.current) paint(layer, animation.canvas, visual.width, visual.height, animationCrop);
          } finally { animation.close(); }
        } catch {
          if (controller.signal.aborted) return;
          const fallback = await loadImage(visual.url).catch(() => null);
          if (fallback && !controller.signal.aborted && !session.current) paint(layer, fallback, visual.width, visual.height, animationCrop);
        }
      })();
    }
    return () => {
      controller.abort();
      session.current?.cancel();
      session.current = null;
    };
  }, [visual, animationCrop, start, duration, audio, audioStart]);

  async function play() {
    if (session.current) {
      session.current.cancel();
      session.current = null;
      setPlaying(false);
      return;
    }
    const controller = new AbortController();
    const moving = video.current;
    const layer = canvas.current?.getContext("2d");
    let context: AudioContext | undefined;
    let animation: Awaited<ReturnType<typeof import("./animation").openAnimation>> | undefined;
    let handle = 0;
    const clipStart = elapsedTime.current >= duration - 0.01 ? 0 : elapsedTime.current;
    elapsedTime.current = clipStart;
    let source: AudioBufferSourceNode | undefined;
    const cancel = () => {
      if (controller.signal.aborted) return;
      controller.abort();
      cancelAnimationFrame(handle);
      moving?.pause();
      try { source?.stop(); } catch {}
      if (context && context.state !== "closed") void context.close().catch(() => {});
      animation?.close();
    };
    session.current = { cancel };
    setPlaying(true);
    setTime(clipStart);
    setError("");
    try {
      if (audio) {
        context = new AudioContext();
        await context.resume();
      }
      if (visual?.kind === "animation" && layer) {
        animation = await (await import("./animation")).openAnimation(visual);
        if (controller.signal.aborted) {
          animation.close();
          return;
        }
      }
      controller.signal.throwIfAborted();
      if (moving) {
        await seekVideo(moving, start + clipStart, controller.signal);
        controller.signal.throwIfAborted();
        await moving.play();
        if (controller.signal.aborted) {
          moving.pause();
          return;
        }
      }
      const begin = context?.currentTime ?? performance.now() / 1000;
      if (audio && context) {
        source = context.createBufferSource();
        source.buffer = audio;
        source.connect(context.destination);
        const offset = audioStart + clipStart;
        const remaining = Math.min(duration - clipStart, audio.duration - offset);
        if (remaining > 0) source.start(begin, offset, remaining);
      }
      const tick = async () => {
        const elapsed = Math.min(duration, clipStart + (context?.currentTime ?? performance.now() / 1000) - begin);
        if (controller.signal.aborted) return;
        elapsedTime.current = elapsed;
        setTime(elapsed);
        if (elapsed >= duration || moving?.ended) {
          cancel();
          session.current = null;
          elapsedTime.current = duration;
          setPlaying(false);
          return;
        }
        try {
          if (animation && layer && visual) {
            await animation.draw(elapsed, controller.signal);
            if (!controller.signal.aborted) paint(layer, animation.canvas, visual.width, visual.height, crop);
          }
          if (moving && context && Math.abs(moving.currentTime - start - elapsed) > 0.18) moving.currentTime = start + elapsed;
          if (!controller.signal.aborted) handle = requestAnimationFrame(() => void tick());
        } catch {
          if (!controller.signal.aborted) {
            cancel();
            session.current = null;
            setPlaying(false);
            setError("Não foi possível reproduzir esse trecho.");
          }
        }
      };
      handle = requestAnimationFrame(() => void tick());
    } catch {
      if (controller.signal.aborted) return;
      cancel();
      session.current = null;
      setPlaying(false);
      setError("Não foi possível reproduzir esse trecho.");
    }
  }

  return <>
    {visual && <figure className="preview-figure">
      {visual.kind === "animation" ? <canvas ref={canvas} width={512} height={512} aria-label="Prévia da animação" />
        : <FramingView visual={visual} crop={crop} onChange={onCropChange}>
          {visual.kind === "video"
            ? <video ref={video} src={visual.url} preload="auto" muted={!keepVideoAudio} playsInline style={framingStyle(visual, crop)} aria-label="Prévia de vídeo" />
            : <img src={visual.url} style={framingStyle(visual, crop)} alt="Prévia da figurinha" />}
        </FramingView>}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>}
    {(audio || visual?.kind !== "image") && <div className="player">
      <button type="button" className="button outline" onClick={() => void play()}><Icon name={playing ? "pause" : "play"} />{playing ? "Pausar" : time > 0 && time < duration - 0.01 ? "Retomar" : audio ? "Ouvir" : "Reproduzir trecho"}</button>
      <div className="player-data">
        <strong>{title}</strong>
        {audio ? <Wave peaks={peaks} range={{ start: audioStart, end: audioStart + time }} total={audio.duration} />
          : <progress aria-label="Posição da prévia" value={time} max={duration} />}
        <small>{timeLabel(time)} / {timeLabel(duration)}</small>
      </div>
    </div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </>;
}
