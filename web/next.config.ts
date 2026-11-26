import type { NextConfig } from "next";
import { resolve } from "node:path";

const config: NextConfig = {
  output: "export",
  poweredByHeader: false,
  turbopack: { root: resolve(__dirname, "..") },
  experimental: { useTypeScriptCli: false },
};

export default config;
