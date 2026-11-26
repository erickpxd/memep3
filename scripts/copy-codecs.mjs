import { copyFile, mkdir } from "node:fs/promises";

const target = new URL("../public/codecs/", import.meta.url);
const source = new URL("../node_modules/@jsquash/webp/codec/enc/", import.meta.url);
await mkdir(target, { recursive: true });
const aacWorker = "mediabunny-aac-encoder.worker.js";
await Promise.all([
  ...["webp_enc.wasm", "webp_enc_simd.wasm"].map((name) => (
    copyFile(new URL(name, source), new URL(name, target))
  )),
  copyFile(new URL(`../node_modules/@mediabunny/aac-encoder/dist/bundles/${aacWorker}`, import.meta.url), new URL(aacWorker, target)),
]);
