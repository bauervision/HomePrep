#!/usr/bin/env node
/*
 * Builds Library content 1.4.0: the household Library's guidance payload.
 *
 *   node scripts/build-library-content.mjs          write the payload and manifest
 *   node scripts/build-library-content.mjs --check  fail if they are out of date
 *
 * Input: the 1.3.0 guidance payload (24 core cards, unchanged) and the
 * reviewed Shelter cards in data/library/v1.4.0/shelter-cards.json. Output:
 * public/library-data/v1.4.0/guidance.json (compact JSON, the only runtime
 * file) and data/library/v1.4.0/manifest.json with its size and SHA-256.
 * Book reviews are not published: they stay in the private research archive
 * under data/library/v*\/runtime/.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const VERSION = "1.4.0";
const PREVIOUS = "1.3.0";
const PREV_GUIDANCE = `public/library-data/v${PREVIOUS}/guidance.json`;
const SHELTER = `data/library/v${VERSION}/shelter-cards.json`;
const OUT = `public/library-data/v${VERSION}/guidance.json`;
const MANIFEST = `data/library/v${VERSION}/manifest.json`;

const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function build() {
  const prev = json(PREV_GUIDANCE);
  const shelter = json(SHELTER);
  const reviewed = shelter.reviewed_on;

  // Book reviews are no longer a separate published collection.
  const policy = { ...prev.policy };
  delete policy.book_reviews_separate;
  const topics = [...prev.topics];
  const t = shelter.topic;
  topics.splice(topics.findIndex((x) => x.id === t.after) + 1, 0, {
    id: t.id,
    label: t.label,
    source_prefixes: t.source_prefixes,
    aliases: t.aliases,
  });

  const evidence = [
    ...prev.evidence,
    ...shelter.evidence.map((e) => ({
      id: `CORE:${e.id}`,
      source_id: "CORE",
      source_evidence_id: e.id,
      record: {
        id: e.id,
        publisher: e.publisher,
        title: e.title,
        url: e.url,
        accessed_on: reviewed,
        page_last_updated: e.page_last_updated,
        access_status: "relevant_content_reviewed",
        locator: e.locator,
        support_scope: e.support_scope,
      },
    })),
  ];
  const evidenceUrl = new Map(shelter.evidence.map((e) => [e.id, e.url]));
  const milestones = ["72_hours", "14_days"];
  const editorial = prev.entries[0].source_record.editorial_adaptation;

  const added = shelter.cards.map((c) => ({
    id: c.id,
    origin: "authoritative_core",
    source_id: "CORE",
    source_item_id: c.id,
    title: c.title,
    summary: c.when_to_use,
    classification: null,
    display_status: "authority_supported",
    reviewed_on: reviewed,
    topic_ids: [t.id],
    source_topics: [t.id],
    search_terms: c.search_terms,
    source_citations: [],
    evidence: c.evidence.map((r) => ({
      evidence_id: `CORE:${r.source_id}`,
      url: evidenceUrl.get(r.source_id),
      relationship: r.relationship,
      scope: r.scope,
    })),
    correction_ids: [],
    milestone_mapping: milestones.map((milestone) => ({
      milestone,
      relevance: "planning_only",
      rationale:
        "No household completion or live app objective mapping is inferred.",
    })),
    safety_flags: [],
    execution_eligible: false,
    automatic_execution_allowed: false,
    readiness_credit: "none",
    source_record: {
      id: c.id,
      topic: t.id,
      title: c.title,
      reviewed_on: reviewed,
      review_status: "source_checked",
      support_level: "authority_with_editorial_application",
      when_to_use: c.when_to_use,
      prerequisites: c.prerequisites,
      steps: c.steps,
      limits: c.limits,
      evidence: c.evidence.map((r) => ({
        source_id: r.source_id,
        url: evidenceUrl.get(r.source_id),
        scope: r.scope,
      })),
      editorial_adaptation: editorial,
      completion: {
        status: "not_assessed",
        requires: c.completion,
        completed_on: null,
      },
      maintenance: c.maintenance,
      escalation: c.escalation,
      site_confirmation_required: c.site_confirmation_required,
      milestones,
      automatic_execution_allowed: false,
    },
  }));

  const meta = prev.source.metadata;
  const payload = {
    ...prev,
    content_version: VERSION,
    policy: {
      ...policy,
      book_reviews: "private_research_archive_not_published",
    },
    topics,
    source: {
      ...prev.source,
      metadata: { ...meta, scope: [...meta.scope, t.id] },
    },
    evidence,
    entries: [...prev.entries, ...added],
  };
  const bytes = Buffer.from(JSON.stringify(payload) + "\n", "utf8");
  const manifest = {
    manifest_version: "1.0.0",
    bundle_version: VERSION,
    packaged_on: reviewed,
    previous_version: PREVIOUS,
    files: [
      {
        path: "runtime/guidance.json",
        bytes: bytes.length,
        sha256: sha256(bytes),
      },
    ],
    inputs: [PREV_GUIDANCE, SHELTER].map((path) => {
      const b = readFileSync(path);
      return { path, bytes: b.length, sha256: sha256(b) };
    }),
    totals: {
      authoritative_core_entries: payload.entries.length,
      added_entries: added.map((e) => e.id),
      topics: topics.length,
      evidence_records: evidence.length,
      book_review_entries_published: 0,
    },
    runtime_loading: {
      base_path: `/library-data/v${VERSION}/`,
      initial: "runtime/guidance.json",
      note: "Guidance is the only published Library payload. Book reviews from every content version are kept privately under data/library/v*/runtime/ and are not served.",
    },
  };
  return {
    bytes,
    manifest: JSON.stringify(manifest, null, 2) + "\n",
  };
}

const { bytes, manifest } = build();
if (process.argv.includes("--check")) {
  const same = (p, b) => {
    try {
      return readFileSync(p).equals(Buffer.from(b));
    } catch {
      return false;
    }
  };
  if (!same(OUT, bytes) || !same(MANIFEST, manifest)) {
    console.error(
      "Library content is out of date. Run: node scripts/build-library-content.mjs",
    );
    process.exit(1);
  }
  console.log(`Library content ${VERSION} is up to date.`);
} else {
  mkdirSync(`public/library-data/v${VERSION}`, { recursive: true });
  writeFileSync(OUT, bytes);
  writeFileSync(MANIFEST, manifest);
  console.log(`Wrote ${OUT} (${bytes.length} bytes) and ${MANIFEST}.`);
}
