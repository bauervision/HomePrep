import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";
import { readPackageVersion } from "./scripts/package-version.mjs";

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
    env: {
      // Inlined at build time from package.json (see src/lib/version.ts).
      NEXT_PUBLIC_APP_VERSION: readPackageVersion(),
      // Always a build-time constant, so release builds (unset) drop the
      // local-emulator connection in lib/firebase.ts entirely.
      NEXT_PUBLIC_HOMEPREP_EMULATORS:
        process.env.NEXT_PUBLIC_HOMEPREP_EMULATORS === "1" ? "1" : "",
    },
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
