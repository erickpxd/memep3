import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  poweredByHeader: false,
  experimental: { useTypeScriptCli: false },
};

export default config;
