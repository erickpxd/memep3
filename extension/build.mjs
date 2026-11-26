import { build } from "esbuild";
import { copyFile, cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const extension = new URL("./", import.meta.url);
const publicAssets = new URL("../web/public/", extension);
const dist = new URL("dist/", extension);
await mkdir(dist, { recursive: true });
await build({
  absWorkingDir: fileURLToPath(extension),
  entryPoints: ["editor.tsx", "launch.ts"],
  outdir: "dist",
  bundle: true,
  splitting: true,
  minify: true,
  format: "esm",
  jsx: "automatic",
  target: "chrome120",
  assetNames: "assets/[name]-[hash]",
  loader: { ".png": "file", ".svg": "file", ".woff2": "file", ".woff": "file" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_MEMEP3_URL": JSON.stringify(process.env.NEXT_PUBLIC_MEMEP3_URL ?? ""),
  },
});
await Promise.all([
  copyFile(new URL("index.html", extension), new URL("index.html", dist)),
  copyFile(new URL("manifest.json", extension), new URL("manifest.json", dist)),
  copyFile(new URL("favicon.png", publicAssets), new URL("favicon.png", dist)),
  copyFile(new URL("logo-header.png", publicAssets), new URL("logo-header.png", dist)),
  cp(new URL("icons/", publicAssets), new URL("icons/", dist), { recursive: true }),
  cp(new URL("codecs/", publicAssets), new URL("codecs/", dist), { recursive: true }),
]);
