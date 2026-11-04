# HomePrep Library content package 1.2.0

Prepared November 3, 2026. This adds Books 11–15 to the existing ten-book Library. Content version 1.2.0 is independent of the HomePrep application release number. The app has not been edited, imported or deployed by this research task.

There are **3,284 entries: 24 unchanged authority-supported core cards and 3,260 book-review records across 15 books**. Book classifications are **140 verified limited principles, 1,311 source-derived references and 1,809 needing review**. These are examination records, not counts of unique tasks or approved procedures. There are 11 unchanged topic groups, 393 namespaced evidence records and 316 corrections.

| Added book | Records | Verified principle | Source reference | Needs review |
|---|---:|---:|---:|---:|
| B011 — Outlive an EMP: Early Pioneer Way | 159 | 4 | 56 | 99 |
| B012 — Herbalist Natural Pharmacy | 265 | 5 | 31 | 229 |
| B013 — Spec Ops Communications | 159 | 12 | 58 | 89 |
| B014 — Syrian Survivor | 215 | 12 | 82 | 121 |
| B015 — Combat Doctor Medicine | 340 | 24 | 96 | 220 |
| Added batch | 1,138 | 57 | 323 | 758 |

The exact machine totals and file sizes are in `manifest.json`; these table values must agree with the input examinations. All earlier entries and core cards remain identical. Both previous package folders remain byte-for-byte unchanged. New wrappers carry the new content version; do not expect those wrappers to hash identically to old versions.

## Files and loading

- `library.bundle.json`: canonical development bundle containing exact source records; approximately 18.4 MB. Keep it out of client startup downloads.
- `library.schema.json`: Draft 7 display schema. Schema version remains 1.0.0; expected content version is 1.2.0.
- `manifest.json`: input provenance, totals, 19 payload/schema SHA-256 hashes and runtime paths. It does not self-hash or hash documentation/validation files.
- `validation.json`: successful schema and 91 semantic checks, with three schema and three semantic invalid controls rejected.
- `app-parser-check.json`: isolated copy of the existing app parser accepts 24 core cards, 3,260 reviews and 15 books with zero rejected valid entries; 1,374 documentary source components preserved.
- `prior-package-hashes.json`: preservation checks for the two existing package folders.
- `runtime/guidance.json`: initial core collection.
- `runtime/reviews-index.json`: lazy research catalog, without original claim text or documentary components.
- `runtime/books/B001.json` through `B015.json`: lazy per-book details, evidence and corrections.

Publish only the **17 runtime files**, with the runtime directory contents directly under `public/library-data/v1.2.0/`. Keep bundle/schema/manifest/validation in the app’s established non-public data directory. Never publish the source PDFs or archive. Reading the books does not authorize redistribution of the PDFs.

## Meaning and safety

Core guidance remains the default. Book reviews stay separate with existing labels, filters, fuzzy search and lazy details. Preserve exact original records, reviewed guidance, evidence scopes, dates, corrections and safety flags. Original claims and documentary components belong in the existing collapsed source section, with reviewed guidance/corrections first.

The new batch contains substantial medical safety corrections and unvalidated civilian-security claims. No invasive medical procedure, drug regimen or tactical protocol in these new reviews is certified. An authority-supported correction does not verify the book’s original claim. Repetition across books does not increase evidence strength or produce a merged procedure.

Keep citations independent: B011–B014 have their own cover/title and printed-page mappings. B015 has an unnumbered cover, followed by printed page = PDF page, 2–122. Its two final sections both say Chapter 20; editorial CH21 identifies the second without renumbering the book. B014’s Final Word is unnumbered as a chapter, while its printed page numbers are present.

B015 page 58’s tourniquet-release instruction and page 92’s opposite instruction remain distinct records. The later caution does not erase the earlier correction. The same applies to malaria-vaccine claims and the later denial that the book contains doses. Detailed auxiliary research ledgers stay in the research source folder; the bundle preserves the parent records and documentary context, not a clinical calculator or medicine order.

All execution, automatic-action and readiness-credit permissions remain disabled. Do not create tasks, goals, purchases, medication reminders or clinical decision rules from the import. The proposed Create Task/Create Goal feature remains a separate scope with editable drafts and explicit saving from suitable reviewed content.

## Validation limits

Schema validation, exact source-record comparisons, input/payload hashes, previous-version preservation, citations, status mappings and parser compatibility pass. The parser test changes only the expected version and local import extension in an isolated workspace copy; the actual app files remain untouched.

No signed-in UI, browser performance, phone layout, app test suite/build, service worker, offline cold launch or hosting delivery was tested for this refresh. The app agent must run its required checks and report untested behavior. Neither packaging nor browsing changes household readiness. The example remains five people, no pets, public water/sewer, with no drinking-water approval for the irrigation well.

Fifteen examinations are complete. The 20-title inventory has four unexamined active titles and one root-cellar title deferred by the user; do not silently resume or count the deferred title to claim twenty completed books.
