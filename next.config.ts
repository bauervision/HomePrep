import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

export default function config(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // Static export: Firebase Hosting serves `out/`; all data access is client-side.
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
    // `*.dev.tsx` pages (the design preview) exist only under `next dev`.
    pageExtensions: dev ? ["dev.tsx", "tsx", "ts"] : ["tsx", "ts"],
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
