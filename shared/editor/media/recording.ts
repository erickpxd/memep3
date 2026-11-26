"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_CLIP } from "./timing";

type Status = "idle" | "requesting" | "recording" | "paused" | "finishing";
type Session = {
  stream: MediaStream;
  recorder: MediaRecorder;
  context: AudioContext;
  timer?: number;
  cancelled: boolean;
  elapsed: number;
  started: number;
};

function release(session: Session) {
  window.clearInterval(session.timer);
  session.stream.getTracks().forEach((track) => track.stop());
  if (session.context.state !== "closed") void session.context.close().catch(() => {});
}

export function useRecording(onComplete: (file: File) => void) {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [error, setError] = useState("");
  const active = useRef<Session | null>(null);
  const attempt = useRef(0);

  function discard() {
    attempt.current++;
    const session = active.current;
    active.current = null;
    if (session) {
      session.cancelled = true;
      if (session.recorder.state !== "inactive") session.recorder.stop();
      release(session);
    }
  }

  useEffect(() => discard, []);

  function cancel() {
    discard();
    setStatus("idle");
    setElapsed(0);
    setPeaks([]);
    setError("");
  }

  function finish() {
    const session = active.current;
    if (session?.recorder.state && session.recorder.state !== "inactive") {
      setStatus("finishing");
      session.recorder.stop();
    }
  }

  async function start(maxSeconds = MAX_CLIP) {
    cancel();
    const id = attempt.current;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("O microfone precisa de um navegador compatível em HTTPS ou localhost.");
      return;
    }
    setStatus("requesting");
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (id !== attempt.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      context = new AudioContext();
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyzer);
      void context.resume().catch(() => {});
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const session: Session = { stream, recorder, context, cancelled: false, elapsed: 0, started: performance.now() };
      active.current = session;
      const chunks: Blob[] = [];
      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      recorder.onerror = () => {
        cancel();
        setError("A gravação foi interrompida. Tente abrir o microfone novamente.");
      };
      recorder.onstop = () => {
        release(session);
        if (session.cancelled || active.current !== session) return;
        active.current = null;
        setStatus("idle");
        const type = recorder.mimeType || chunks[0]?.type || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File(chunks, `voz-memep3.${ext}`, { type });
        if (file.size) onComplete(file);
        else setError("A gravação ficou vazia. Grave novamente.");
      };
      recorder.start(200);
      setStatus("recording");
      const values = new Float32Array(analyzer.fftSize);
      session.timer = window.setInterval(() => {
        if (recorder.state !== "recording") return;
        const time = session.elapsed + (performance.now() - session.started) / 1000;
        setElapsed(Math.min(maxSeconds, time));
        analyzer.getFloatTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, sample) => sum + sample * sample, 0) / values.length);
        setPeaks((current) => [...current.slice(-57), Math.min(1, Math.max(0.03, rms * 6))]);
        if (time >= maxSeconds) finish();
      }, 60);
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context?.state !== "closed") void context?.close().catch(() => {});
      if (id !== attempt.current) return;
      active.current = null;
      setStatus("idle");
      const refused = cause instanceof DOMException && cause.name === "NotAllowedError";
      setError(refused ? "Permissão de microfone negada. Autorize o acesso no navegador ou envie um arquivo." : "Não foi possível abrir o microfone. Confira se ele está disponível.");
    }
  }

  function pause() {
    const session = active.current;
    if (!session) return;
    if (session.recorder.state === "paused") {
      session.started = performance.now();
      session.recorder.resume();
      setStatus("recording");
    } else if (session.recorder.state === "recording") {
      session.elapsed += (performance.now() - session.started) / 1000;
      session.recorder.pause();
      setStatus("paused");
    }
  }

  return { status, elapsed, peaks, error, start, pause, finish, cancel };
}
