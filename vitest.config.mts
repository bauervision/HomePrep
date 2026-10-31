import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { readPackageVersion } from "./scripts/package-version.mjs";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    // Same build-time value next.config.ts inlines for the app.
    env: { NEXT_PUBLIC_APP_VERSION: readPackageVersion() },
  },
});
