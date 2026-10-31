# Releasing HomePrep

`package.json` `version` is the only source of the application version. It is
inlined at build time (`next.config.ts` → `NEXT_PUBLIC_APP_VERSION`) and shown
on the sign-in page, beneath "HomePrep" in the navbar, and in `/version.json`.
The browser never reads `package.json`.

## Classification (semantic versioning)

| Kind      | Use for                                                     |
| --------- | ----------------------------------------------------------- |
| **major** | Breaking or major product release. Needs explicit approval. |
| **minor** | New functionality or significant architecture.              |
| **patch** | Bug fixes and small improvements.                           |

Before 1.0, releases stay in `0.x.y`. `1.0.0` (a major release) needs
explicit approval and `--allow-major`.

## Steps for each release

1. **Classify** the release (patch, minor or major).
2. **Check state:** `pnpm release:status`
3. **Prepare:** `pnpm release:prepare <kind>`
   - Bumps `package.json` **once**. The last release is the newest `vX.Y.Z`
     tag, or HEAD's committed version before any tag exists.
   - Running it again for the same release does nothing (no double bump). A
     different classification for an already-prepared version is refused.
   - `pnpm-lock.yaml` does not record the root version, so it needs no change.
4. **Validate and build:** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
5. **Verify the build:** `pnpm release:verify` (compares `out/version.json`
   with `package.json`).
6. **Commit** the release (when authorized).
7. **Deploy** only when authorized: `firebase deploy --only hosting`
   (rules separately: `firebase deploy --only firestore:rules`).
8. **Report:** `pnpm release:verify https://homeprep-d41cd.web.app`
9. **Tag:** `pnpm release:tag` creates the local `vX.Y.Z` tag. Push it only
   when authorized: `git push origin vX.Y.Z`.

## Redeploying the same release

Rebuild and deploy without running `release:prepare`. Builds, `pnpm dev` and
deployments never change the version.
