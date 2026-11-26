import { validateSticker } from "./webp";

export const MIN_PACK_SIZE = 3;
export const MAX_PACK_SIZE = 30;

type StickerPackSticker = { image_data: string; emojis: string[] };
export type StickerPack = {
  format: "memep3-pack-v1";
  identifier: string;
  name: string;
  publisher: string;
  tray_image: string;
  animated_sticker_pack: boolean;
  stickers: StickerPackSticker[];
};

function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function trayIcon(sticker: Blob) {
  const bitmap = await createImageBitmap(sticker);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível criar o ícone do pacote.");
    context.drawImage(bitmap, 0, 0, 96, 96);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob && blob.size <= 50_000) resolve(blob);
      else reject(new Error("Não foi possível criar o ícone do pacote."));
    }, "image/png"));
  } finally {
    bitmap.close();
  }
}

export async function makeStickerPack(name: string, animated: boolean, stickers: Blob[]) {
  const title = name.trim();
  if (!title || title.length > 128 || stickers.length < MIN_PACK_SIZE || stickers.length > MAX_PACK_SIZE) {
    throw new Error("Escolha um nome e adicione de 3 a 30 figurinhas ao pacote.");
  }
  const images = await Promise.all(stickers.map(async (sticker) => {
    validateSticker(new Uint8Array(await sticker.arrayBuffer()), animated);
    return { image_data: await base64(sticker), emojis: ["😀"] };
  }));
  const pack: StickerPack = {
    format: "memep3-pack-v1",
    identifier: `memep3-${crypto.randomUUID()}`,
    name: title,
    publisher: "MemeP3",
    tray_image: await base64(await trayIcon(stickers[0])),
    animated_sticker_pack: animated,
    stickers: images,
  };
  return new Blob([JSON.stringify(pack)], { type: "application/json" });
}
