import { defineConfig } from "vitest/config";

// Security-rules tests. They need the Firestore emulator, so they run only via
// `pnpm test:rules` (which starts and stops the emulator), not `pnpm test`.
export default defineConfig({
  test: {
    include: ["rules-tests/**/*.rules.test.ts"],
    environment: "node",
    testTimeout: 20000,
    fileParallelism: false,
  },
});
