import { build } from "esbuild";
import { copyFile, cp, mkdir } from "node:fs/promises";

const dist = new URL("../dist/extension/", import.meta.url);
await mkdir(dist, { recursive: true });
await build({
  entryPoints: ["extension/editor.tsx", "extension/launch.ts"],
  outdir: "dist/extension",
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
  copyFile("extension/index.html", new URL("index.html", dist)),
  copyFile("extension/manifest.json", new URL("manifest.json", dist)),
  copyFile("public/favicon.png", new URL("favicon.png", dist)),
  copyFile("public/logo-header.png", new URL("logo-header.png", dist)),
  cp("public/icons", new URL("icons", dist), { recursive: true }),
  cp("public/codecs", new URL("codecs/", dist), { recursive: true }),
]);
