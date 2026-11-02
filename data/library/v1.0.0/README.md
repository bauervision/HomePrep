# HomePrep Library data package

Package version 1.0.0, prepared November 2, 2026. This package adapts existing examinations and the authoritative core for read-only Library display. It does not add new verification or change the source classifications.

## Contents

| File | Purpose |
| --- | --- |
| `library.bundle.json` | Canonical complete bundle for development and integrity checks |
| `library.schema.json` | Draft 7 schema for the canonical bundle |
| `manifest.json` | Versions, payload sizes and SHA-256 hashes, input provenance, labels and defaults |
| `validation.json` | Schema validation, semantic checks and rejected invalid controls |
| `runtime/guidance.json` | Initial guidance collection, with full cards and authority evidence |
| `runtime/reviews-index.json` | Searchable book-review catalog without original claims or nested project components |
| `runtime/books/B001.json` through `B007.json` | Full records, evidence and corrections, loaded when opening a book entry |

There are **1,490 entries**: 24 authority-supported core cards and 1,466 book-review records across seven books. Book classifications remain **63 verified principles, 649 source-derived references and 754 needing review**. There are 11 topic groups, 179 namespaced evidence records and 105 namespaced corrections. These are review records, not 1,490 unique or approved procedures.

## Data contract

Each entry has a stable `id`, `origin`, `source_id`, `source_item_id`, title, summary, topic IDs, original topic tags, search terms, review date, citations, evidence references, correction references, milestone associations and display restrictions. `source_record` is the unchanged original book item or core card. It preserves verification dates, original claims, safety flags and nested components.

Core entries use `origin: authoritative_core`, `classification: null`, and `display_status: authority_supported`. Book entries use `origin: book_review` and retain one of the original three classifications. `verified_guidance` maps to the display label **Verified principle — limited scope**; it does not approve the original recipe, installation or build. Evidence and correction IDs are namespaced by their source, for example `B001:E01`, `B005:E01` and `CORE:A01`.

For book citations, book and PDF page endpoints are distinct and preserved exactly. A null printed-page endpoint means unnumbered or unspecified, not zero. Never calculate a missing page from the other numbering system. Core cards have no book page citations; show their authority links instead.

All entries have `execution_eligible: false`, `automatic_execution_allowed: false` and `readiness_credit: none`. Library display never adds inventory, tasks, goals or completion credit. Proposed milestone associations are preserved as research metadata. In particular, 14 days and off-grid are not automatically mapped to the app's 7-, 30-, 60- or 90-day objectives.

The core is a **five-person example**. The canonical source metadata preserves the original research profile. Runtime guidance uses an anonymous example scenario and excludes the user's reported well-cost description, unknown inventory fields and personal research-profile wording. Never replace a signed-in household's profile with this example.

## Runtime loading

Copy the **contents** of `runtime/` into `C:/Bauer/HomePrep/public/library-data/v1.0.0/` during implementation. The resulting URLs are:

- `/library-data/v1.0.0/guidance.json`
- `/library-data/v1.0.0/reviews-index.json`
- `/library-data/v1.0.0/books/B001.json` through `B007.json`

Load guidance on entering Library. Load the review index only when entering Book reviews; load the appropriate book detail file only when opening an entry. `detail_path` in the index is relative to `/library-data/v1.0.0/`. Do not download the 8.27 MB canonical bundle on app startup. Do not copy PDFs, source archives, original household-profile metadata or development inputs into `public/`.

Use the index for title, reviewed-summary, topic and keyword searches. Raw original procedures and ingredients are available in book details, not the initial search catalog. This intentionally avoids presenting source instructions as search snippets. Filters apply before fuzzy ranking and pagination; preserve classifications regardless of ranking.

The runtime files are ordinary static reference assets; the sign-in screen does not make public asset URLs access-controlled. Do not put household documents or secrets in them. Browser caching is not a tested offline cold-launch guarantee. Failed loads must show an error and retry option, not an empty collection presented as complete.

## Rebuild and validate

From the research workspace, run `library-data/tools/build_app_library.py`, then `library-data/tools/Validate-AppLibrary.ps1` with the bundled Python and PowerShell runtimes. The builder reads original inputs without modifying them. The validator checks the canonical schema, hashes, exact record preservation, page citations, namespaces, status mapping, totals and runtime projections. It rejects invalid statuses, broken evidence and action permissions. Validation does not test the app interface or re-verify external guidance.

The implementation instructions are in `library-data/handoffs/LPI-Library-Integration-v1.0.0.md` in the research workspace.
