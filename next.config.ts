import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

export default function config(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  // NEXT_PUBLIC_HOMEPREP_PREVIEW=1 includes the design preview in a static build
  // for offline visual checks. Never set it for builds that will be deployed.
  const preview = dev || process.env.NEXT_PUBLIC_HOMEPREP_PREVIEW === "1";
  return {
    // Static export: Firebase Hosting serves `out/`; all data access is client-side.
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
    // `*.dev.tsx` pages (the design preview) exist only under `next dev` (or a preview build).
    pageExtensions: preview ? ["dev.tsx", "tsx", "ts"] : ["tsx", "ts"],
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
