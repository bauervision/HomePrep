# HomePrep Library content 1.4.0

Prepared 2026-11-04 with app release 0.8.0. The content version is independent
of the app version.

## What changed from 1.3.0

- **Guidance is the household Library.** The only published file is
  `public/library-data/v1.4.0/guidance.json`. Book reviews are no longer a
  published collection.
- **Shelter topic.** It is added after Communications, with three
  authority-supported cards:
  - `HP-H01` Choose where to shelter for each hazard
  - `HP-H02` Arrange an accessible backup place to stay
  - `HP-H03` Follow official evacuation instructions

  Each card was checked against the cited Ready.gov page on 2026-11-04. The
  evidence records keep each page's "Last updated" date
  (`page_last_updated`).
- **Unchanged.** The 24 existing core cards, their evidence (`CORE:A01`–`A18`)
  and the other eleven topic groups are identical to 1.3.0. Evidence `A19`–`A23`
  is new.

## Files

- `shelter-cards.json`: the reviewed Shelter topic, cards and evidence.
- `manifest.json`: size and SHA-256 of the published payload, its inputs and
  totals.

Rebuild or check with `node scripts/build-library-content.mjs [--check]`.
`src/lib/library/data.test.ts` checks the manifest, the build and the archive.

## Private research archive

All 19 book examinations remain in this repository's private storage and are
not served. Each earlier pack keeps its manifest, bundle, schema and
validation under `data/library/v1.0.0`–`v1.3.0`. The review index and
per-book detail files are under `runtime/`, byte-identical to their
manifests. Only each version's `guidance.json` stays public, so open tabs on
older releases still load.
