#!/usr/bin/env node
/*
 * Release preparation for HomePrep. See RELEASING.md.
 *
 *   pnpm release:status                  current version and release state
 *   pnpm release:prepare <patch|minor|major> [--allow-major]
 *                                        bump package.json once for a release
 *   pnpm release:verify [url]            check out/version.json, or a deployed site
 *   pnpm release:tag                     tag the committed release (local tag only)
 *
 * Nothing here builds, deploys, commits or pushes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readPackageVersion } from "./package-version.mjs";
import {
  compareVersions,
  latestTaggedVersion,
  planRelease,
  setPackageVersion,
} from "./release-lib.mjs";

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

function baseline() {
  const tagged = latestTaggedVersion(git("tag", "--list", "v*").split("\n"));
  if (tagged) return { version: tagged, source: `tag v${tagged}` };
  const committed = JSON.parse(git("show", "HEAD:package.json")).version;
  return { version: committed, source: "HEAD (no release tags yet)" };
}

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);

try {
  const current = readPackageVersion();
  switch (command) {
    case "status": {
      const b = baseline();
      const cmp = compareVersions(current, b.version);
      console.log(`package.json version: ${current}`);
      console.log(`last release:         ${b.version} (${b.source})`);
      console.log(
        `state:                ${
          cmp === 0
            ? "no release prepared"
            : cmp > 0
              ? `v${current} prepared, not yet tagged as released`
              : "INCONSISTENT: package.json is older than the last release"
        }`,
      );
      break;
    }
    case "prepare": {
      const kind = rest.find((a) => !a.startsWith("--"));
      if (!kind)
        fail("usage: release:prepare <patch|minor|major> [--allow-major]");
      const b = baseline();
      const plan = planRelease({
        current,
        baseline: b.version,
        kind,
        allowMajor: rest.includes("--allow-major"),
      });
      if (plan.action === "already-prepared") {
        console.log(
          `v${plan.version} is already prepared (${kind} from ${b.version}). Not bumping again.`,
        );
      } else {
        const text = readFileSync("package.json", "utf8");
        writeFileSync("package.json", setPackageVersion(text, plan.to));
        console.log(`Prepared ${kind} release: ${plan.from} -> ${plan.to}`);
        // The root version is not recorded in pnpm-lock.yaml, so the lockfile
        // stays consistent without changes.
      }
      console.log(
        "Next: pnpm build, then pnpm release:verify, then deploy when authorized.",
      );
      break;
    }
    case "verify": {
      const url = rest[0];
      let deployed;
      if (url) {
        const res = await fetch(new URL("/version.json", url), {
          cache: "no-store",
        });
        if (!res.ok) fail(`${url}/version.json returned ${res.status}`);
        deployed = (await res.json()).version;
      } else {
        if (!existsSync("out/version.json"))
          fail("out/version.json not found; run pnpm build first.");
        deployed = JSON.parse(readFileSync("out/version.json", "utf8")).version;
      }
      const where = url ?? "out/ (local build)";
      if (deployed !== current)
        fail(`${where} serves ${deployed}, package.json is ${current}.`);
      console.log(`${where} serves v${deployed} (matches package.json).`);
      break;
    }
    case "tag": {
      const tag = `v${current}`;
      if (git("tag", "--list", tag)) {
        console.log(`${tag} already exists. Nothing to do.`);
        break;
      }
      const committed = JSON.parse(git("show", "HEAD:package.json")).version;
      if (committed !== current)
        fail(`commit the ${tag} version change before tagging.`);
      git("tag", "-a", tag, "-m", `HomePrep ${tag}`);
      console.log(
        `Created local tag ${tag}. Push it only when authorized: git push origin ${tag}`,
      );
      break;
    }
    default:
      fail(
        "commands: status | prepare <patch|minor|major> [--allow-major] | verify [url] | tag",
      );
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
