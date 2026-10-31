import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { readPackageVersion } from "../../scripts/package-version.mjs";
import {
  bumpVersion,
  latestTaggedVersion,
  planRelease,
  setPackageVersion,
} from "../../scripts/release-lib.mjs";
import { APP_VERSION, versionLabel } from "./version";

const pkgVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

describe("application version", () => {
  it("is inlined from package.json by the Next.js config", () => {
    const config = nextConfig("phase-production-build");
    expect(config.env?.NEXT_PUBLIC_APP_VERSION).toBe(pkgVersion);
    expect(nextConfig("phase-development-server").env).toEqual(config.env);
  });

  it("is the value every on-screen label reads", () => {
    expect(APP_VERSION).toBe(pkgVersion);
    expect(versionLabel()).toBe(`v${pkgVersion}`);
  });

  it("follows package.json on the next build", () => {
    const dir = mkdtempSync(join(tmpdir(), "homeprep-version-"));
    try {
      const file = join(dir, "package.json");
      writeFileSync(file, '{\n  "name": "x",\n  "version": "0.5.0"\n}\n');
      expect(readPackageVersion(dir)).toBe("0.5.0");
      writeFileSync(
        file,
        setPackageVersion(readFileSync(file, "utf8"), "0.6.0"),
      );
      expect(readPackageVersion(dir)).toBe("0.6.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("release preparation", () => {
  it("classifies bumps, staying in 0.x until 1.0 is approved", () => {
    expect(bumpVersion("0.5.0", "minor")).toBe("0.6.0");
    expect(bumpVersion("0.6.0", "patch")).toBe("0.6.1");
    expect(bumpVersion("0.6.1", "minor")).toBe("0.7.0");
    expect(bumpVersion("0.9.3", "major")).toBe("1.0.0");
  });

  it("bumps exactly once per release", () => {
    expect(
      planRelease({ current: "0.5.0", baseline: "0.5.0", kind: "minor" }),
    ).toEqual({ action: "bump", from: "0.5.0", to: "0.6.0" });
    // Preparing again (or redeploying) does not bump a second time.
    expect(
      planRelease({ current: "0.6.0", baseline: "0.5.0", kind: "minor" }),
    ).toEqual({ action: "already-prepared", version: "0.6.0" });
  });

  it("refuses a conflicting or inconsistent version", () => {
    expect(() =>
      planRelease({ current: "0.6.0", baseline: "0.5.0", kind: "patch" }),
    ).toThrow(/not a patch release/);
    expect(() =>
      planRelease({ current: "0.4.0", baseline: "0.5.0", kind: "minor" }),
    ).toThrow(/older/);
  });

  it("requires explicit approval for a major release", () => {
    expect(() =>
      planRelease({ current: "0.9.0", baseline: "0.9.0", kind: "major" }),
    ).toThrow(/approval/);
    expect(
      planRelease({
        current: "0.9.0",
        baseline: "0.9.0",
        kind: "major",
        allowMajor: true,
      }),
    ).toMatchObject({ to: "1.0.0" });
  });

  it("finds the last released version from tags", () => {
    expect(latestTaggedVersion(["v0.2.0", "v0.10.0", "v0.9.1", "x", ""])).toBe(
      "0.10.0",
    );
    expect(latestTaggedVersion([""])).toBeNull();
  });

  it("changes only the version field", () => {
    const text = readFileSync("package.json", "utf8");
    const next = setPackageVersion(text, "9.9.9");
    expect(JSON.parse(next)).toEqual({
      ...JSON.parse(text),
      version: "9.9.9",
    });
    expect(next.replace("9.9.9", pkgVersion)).toBe(text);
  });
});
