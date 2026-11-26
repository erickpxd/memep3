export type Crop = { x: number; y: number; scale: number };
export const centered: Crop = { x: 0.5, y: 0.5, scale: 1 };

export function mediaBox(width: number, height: number, crop: Crop) {
  const cover = crop.scale / Math.min(width, height);
  const w = width * cover;
  const h = height * cover;
  return { left: crop.x - w / 2, top: crop.y - h / 2, width: w, height: h };
}

export function constrainCrop(width: number, height: number, crop: Crop): Crop {
  const box = mediaBox(width, height, crop);
  const margin = (size: number) => Math.max(0, size / 2 - 0.25);
  const clamp = (center: number, size: number) => Math.max(-margin(size), Math.min(1 + margin(size), center));
  return { ...crop, x: clamp(crop.x, box.width), y: clamp(crop.y, box.height) };
}
