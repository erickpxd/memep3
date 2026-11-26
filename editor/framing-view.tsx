"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { centered, constrainCrop, mediaBox } from "./framing";
import type { Crop } from "./framing";
import type { Visual } from "./media";

export function framingStyle(visual: Visual, crop: Crop) {
  const box = mediaBox(visual.width, visual.height, crop);
  return {
    left: `${box.left * 100}%`, top: `${box.top * 100}%`,
    width: `${box.width * 100}%`, height: `${box.height * 100}%`,
  };
}

export function FramingView({ visual, crop, onChange, children }: {
  visual: Visual; crop: Crop; onChange?: (crop: Crop) => void; children: ReactNode;
}) {
  const drag = useRef<{ id: number; x: number; y: number; side: number; crop: Crop } | null>(null);
  const [dragging, setDragging] = useState(false);
  const adjust = (next: Crop) => onChange?.(constrainCrop(visual.width, visual.height, next));
  const minZoom = Math.min(0.25, Math.floor(1000 * Math.min(visual.width, visual.height) / Math.max(visual.width, visual.height)) / 1000 || 0.001);

  return <>
    <div className={`framing-window${onChange ? " movable" : ""}${dragging ? " moving" : ""}`}
      tabIndex={onChange ? 0 : undefined} role={onChange ? "group" : undefined}
      aria-label={onChange ? "Quadro de enquadramento. Use as setas para mover a mídia." : undefined}
      onPointerDown={onChange ? (event) => {
        if (drag.current || event.button !== 0) return;
        const node = event.currentTarget;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, side: node.clientWidth, crop };
        node.setPointerCapture(event.pointerId);
        setDragging(true);
      } : undefined}
      onPointerMove={onChange ? (event) => {
        const initial = drag.current;
        if (!initial || initial.id !== event.pointerId || !initial.side) return;
        adjust({
          ...initial.crop,
          x: initial.crop.x + (event.clientX - initial.x) / initial.side,
          y: initial.crop.y + (event.clientY - initial.y) / initial.side,
        });
      } : undefined}
      onLostPointerCapture={(event) => {
        if (event.pointerId !== drag.current?.id) return;
        drag.current = null;
        setDragging(false);
      }}
      onKeyDown={onChange ? (event) => {
        const step = event.shiftKey ? 0.1 : 0.025;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (!dx && !dy && event.key !== "Home") return;
        event.preventDefault();
        adjust(event.key === "Home" ? centered : { ...crop, x: crop.x + dx, y: crop.y + dy });
      } : undefined}>
      {children}
    </div>
    {onChange && <div className="framing-controls">
      <p>Arraste {visual.kind === "video" ? "o vídeo" : "a imagem"} para posicionar no quadro.</p>
      <div className="framing-adjustments">
        <label>Zoom<input type="range" min={minZoom} max={2.5} step={0.001} value={crop.scale}
          onChange={(event) => adjust({ ...crop, scale: Number(event.currentTarget.value) })} /></label>
        <button type="button" className="button outline" onClick={() => onChange(centered)}>Redefinir</button>
      </div>
    </div>}
  </>;
}
