import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The application version: package.json is the only source. Read at build
 * (next.config.ts), test (vitest) and release (scripts/release.mjs) time;
 * never read by the browser.
 * @param {string} [root] project directory containing package.json
 * @returns {string}
 */
export function readPackageVersion(root = process.cwd()) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (typeof pkg.version !== "string" || !pkg.version) {
    throw new Error("package.json has no version.");
  }
  return pkg.version;
}
