# HomePrep Library content package 1.1.0

Prepared November 2, 2026. This is the ten-book update for the existing Library, independent of the HomePrep application release number. The original seven-book package remains unchanged.

## Contents and counts

There are **2,146 entries**: **24 unchanged authority-supported core cards** and **2,122 book-review records across ten books**. Review classifications are **83 verified principles, 988 source-derived references and 1,051 needing review**. These are extraction records, not counts of unique or approved household procedures.

The package has 11 topic groups, 246 namespaced evidence records and 172 namespaced corrections. Topic-prefix mappings extend the same groups to the new books' home, animals, health and money tags. Existing entries retain their IDs, contents, citations, classifications and topic mappings exactly.

| New book | Records | Verified principle | Source reference | Needs review |
|---|---:|---:|---:|---:|
| B008 — A Former Amish’s Survival Guide | 239 | 12 | 72 | 155 |
| B009 — Four-acre self-sufficient farm | 170 | 2 | 109 | 59 |
| B010 — Army engineer EMP home guide | 247 | 6 | 158 | 83 |
| Added batch | 656 | 20 | 339 | 297 |

## Files

- `library.bundle.json`: canonical development bundle, including exact source records.
- `library.schema.json`: Draft 7 display-bundle schema; schema version remains 1.0.0, content version is 1.1.0.
- `manifest.json`: input provenance, SHA-256 hashes, sizes, totals and runtime paths.
- `validation.json`: schema and 66 semantic checks, plus rejected invalid controls.
- `app-parser-check.json`: isolated existing-app parser compatibility check, with only its expected content version changed.
- `prior-package-hashes.json`: preservation check for every previous package file.
- `runtime/guidance.json`: initial core collection, about 93 KB.
- `runtime/reviews-index.json`: research search catalog, about 3.48 MB; no original claims or nested source components.
- `runtime/books/B001.json` through `B010.json`: per-book full detail, evidence and corrections, loaded on demand.

The canonical bundle is about 11.51 MB. Keep it out of the browser's initial payload. Exact sizes and hashes are in the manifest. There are twelve runtime files and fourteen manifest-hashed payload/schema files. The manifest does not self-hash or hash documentation/validation reports.

## Integration contract

Publish only the contents of `runtime/` to `public/library-data/v1.1.0/`. Keep canonical bundle, schema, manifest and validation in a non-public development-data directory. Do not copy PDFs or the research source archive.

The existing app rejects unexpected content versions. Update its `LIBRARY_VERSION` and related versioned data fixtures/tests together; do not merely overwrite its version1.0.0 files with this content. Core is still the default, and reviews remain a separate collection.

Every entry preserves its source record and exact independent printed-book/PDF page endpoints. A null printed endpoint means unnumbered; never derive it from the PDF position. New examinations use unchanged examination schema1.4.0. Nested source components are documentary source text, held from execution and initially collapsed in the UI. B010's violent retaking proposal is only a high-level excluded reference, without operational source components.

Verified means only the limited reviewed principle has evidence. An authority-backed correction does not verify the original claim or complete procedure. Repeated ideas across books remain separately attributed; totals do not count unique actions.

All household mutation, automatic execution and readiness-credit flags remain disabled. Import must not create tasks, goals, purchases or completion credit. The user's proposed Create Task/Create Goal flow needs a separate implementation with editable drafts and explicit saving; this data refresh does not implement it or promote unverified research into instructions.

## Validation and limits

Run `tools/Validate-AppLibrary-v1_1.ps1` using PowerShell7. The version-specific builder is `tools/build_app_library_v1_1.py`; the original builder remains for the historical package and must not be run against its old output for this update.

The checks recompute counts, compare exact source records, validate links/dates and all manifest hashes, reject invalid statuses/actions, preserve old entries/core, and confirm the prior package is unchanged. The isolated parser check accepted all 24 core entries and 2,122 reviews, including all ten book files, citations and 846 documentary components. It used copies of the app's parser/types in the research temporary directory with only the expected version changed; no app file was edited.

These are packaging/parser checks. They do not certify an EMP shield, verify every source claim, test household equipment, establish offline cold launch, or test the signed-in app, build or deployment. Integration and app acceptance remain the app agent's work.
