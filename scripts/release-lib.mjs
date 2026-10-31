/*
 * Release versioning rules (pure; used by scripts/release.mjs and tests).
 *
 * The "baseline" is the last released version: the newest vX.Y.Z git tag, or,
 * before any release has been tagged, the version committed at HEAD.
 *   - package.json == baseline  → nothing prepared yet; prepare bumps once.
 *   - package.json >  baseline  → a release is already prepared; preparing the
 *     same classification again is a no-op (no double increment).
 *   - package.json <  baseline  → inconsistent; refuse.
 * Builds, dev runs and redeployments never change the version.
 */

/** @typedef {"patch" | "minor" | "major"} ReleaseKind */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** @param {string} v */
export function parseVersion(v) {
  const m = SEMVER.exec(v.trim().replace(/^v/, ""));
  if (!m) throw new Error(`Not a release version (X.Y.Z): ${v}`);
  return m.slice(1).map(Number);
}

/** @param {string} a @param {string} b @returns {number} */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** @param {string} v @param {ReleaseKind} kind */
export function bumpVersion(v, kind) {
  const [major, minor, patch] = parseVersion(v);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown release kind: ${kind} (use patch, minor or major)`);
}

/** Newest X.Y.Z among `vX.Y.Z` tag names, or null. @param {string[]} tags */
export function latestTaggedVersion(tags) {
  const versions = tags
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .map((t) => t.slice(1));
  versions.sort(compareVersions);
  return versions.at(-1) ?? null;
}

/**
 * Decides what preparing a release should do.
 * @param {{ current: string, baseline: string, kind: ReleaseKind, allowMajor?: boolean }} o
 * @returns {{ action: "bump", from: string, to: string }
 *   | { action: "already-prepared", version: string }}
 */
export function planRelease({ current, baseline, kind, allowMajor = false }) {
  if (kind === "major" && !allowMajor) {
    throw new Error(
      "Major releases require explicit approval: re-run with --allow-major once approved.",
    );
  }
  const expected = bumpVersion(baseline, kind);
  const cmp = compareVersions(current, baseline);
  if (cmp < 0) {
    throw new Error(
      `package.json (${current}) is older than the last release (${baseline}).`,
    );
  }
  if (cmp === 0) return { action: "bump", from: current, to: expected };
  if (current === expected)
    return { action: "already-prepared", version: current };
  throw new Error(
    `package.json is already at ${current}, which is not a ${kind} release of ${baseline} (expected ${expected}). Resolve the version by hand before preparing.`,
  );
}

/**
 * Replaces only the top-level "version" value, preserving formatting.
 * @param {string} json package.json text @param {string} next
 */
export function setPackageVersion(json, next) {
  parseVersion(next);
  let replaced = 0;
  const out = json.replace(/^(\s{2}"version":\s*")[^"]*(")/m, (_, a, b) => {
    replaced++;
    return `${a}${next}${b}`;
  });
  if (replaced !== 1) throw new Error("Could not find the package version.");
  return out;
}
