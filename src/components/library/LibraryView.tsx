"use client";

import { Check, Library, RotateCcw, Search, X } from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, cx, Input, Modal, PageHeader } from "@/components/ui";
import {
  browse,
  PAGE_SIZE,
  readParams,
  RETIRED_PARAMS,
} from "@/lib/library/browse";
import { formatDate } from "@/lib/library/format";
import { useGuidance } from "@/lib/library/load";
import { buildIndex, type Indexed } from "@/lib/library/search";
import type { GuidanceEntry, LibraryTopic } from "@/lib/library/types";
import { setParams, useSearch } from "@/lib/url-state";
import {
  GuidanceDetail,
  LoadError,
  StatusBadge,
  UnavailableBody,
} from "./LibraryDetail";
import { primaryTopic, topicStyle, TopicLabel } from "./topics";

/*
 * Read-only household Library: authority-supported guidance. All state lives
 * in the URL (q, topic, entry). Book reviews are a private research archive;
 * links to the retired Book reviews collection fall back to Guidance with a
 * notice. Nothing here touches household data.
 */

const NO_TOPICS: LibraryTopic[] = [];

const fmt = (n: number) => n.toLocaleString("en-US");

function Pill({
  pressed,
  disabled,
  onClick,
  topicId,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Topic accent; omitted for the neutral All topics pill. */
  topicId?: string;
  children: ReactNode;
}) {
  const s = topicId ? topicStyle(topicId) : null;
  const Icon = s?.icon;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      data-topic={topicId}
      className={cx(
        "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-left text-sm outline-offset-2 focus-visible:ring-2 focus-visible:ring-amber sm:min-h-9",
        pressed
          ? cx(
              "font-medium text-ivory outline-2 outline-solid",
              s
                ? s.selected
                : "border-copper-light/70 bg-copper/15 outline-copper-light/50",
            )
          : cx(
              "text-ivory-dim hover:text-ivory",
              s ? s.pill : "border-line hover:border-line-strong",
            ),
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {pressed && (
        <Check
          size={14}
          aria-hidden
          strokeWidth={3}
          className={cx("shrink-0", s ? s.text : "text-copper-light")}
        />
      )}
      {Icon && !pressed && (
        <Icon size={14} aria-hidden className={cx("shrink-0", s.text)} />
      )}
      {children}
    </button>
  );
}

function EntryCard({
  entry,
  topics,
  onOpen,
}: {
  entry: GuidanceEntry;
  topics: LibraryTopic[];
  onOpen: () => void;
}) {
  const topic = primaryTopic(entry.topic_ids);
  const others = entry.topic_ids.filter((t) => t !== topic);
  return (
    <li className="min-w-0">
      <button
        type="button"
        data-entry-id={entry.id}
        data-topic={topic}
        aria-haspopup="dialog"
        onClick={onOpen}
        className={cx(
          "surface flex h-full w-full flex-col items-start gap-2 border-l-4 p-4 text-left outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-amber",
          topicStyle(topic).card,
        )}
      >
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <TopicLabel id={topic} topics={topics} />
          {others.map((t) => (
            <TopicLabel key={t} id={t} topics={topics} />
          ))}
        </span>
        <span className="text-[15px] leading-snug font-medium [overflow-wrap:anywhere] text-ivory">
          {entry.title}
        </span>
        {entry.summary && (
          <span className="line-clamp-3 text-sm leading-relaxed [overflow-wrap:anywhere] text-ivory-dim">
            {entry.summary}
          </span>
        )}
        <span className="mt-auto flex flex-col items-start gap-1.5 pt-1">
          <StatusBadge status={entry.status} />
          {entry.reviewed_on && (
            <span className="text-xs text-slate">
              Reviewed {formatDate(entry.reviewed_on)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Search index for the loaded guidance, built once per payload. */
function useEntryIndex(
  data: { entries: GuidanceEntry[]; topics: LibraryTopic[] } | null,
): Indexed<GuidanceEntry>[] {
  return useMemo(
    () => (data ? buildIndex<GuidanceEntry>(data.entries, data.topics) : []),
    [data],
  );
}

function useBrowse(
  index: Indexed<GuidanceEntry>[],
  topics: LibraryTopic[],
  query: string,
  topic: string | null,
) {
  return useMemo(
    () => browse(index, topics, query, { topic }),
    [index, topics, query, topic],
  );
}

export function LibraryView() {
  const search = useSearch();
  const params = readParams(search);
  const notice = search.get("notice") === "reviews";
  const guidance = useGuidance();
  const entry = params.entry
    ? guidance.data?.entries.find((e) => e.id === params.entry)
    : undefined;

  // A link to the retired Book reviews collection becomes a plain Guidance
  // link (kept in the URL, so refresh shows the same notice).
  useEffect(() => {
    if (!params.retiredReviews) return;
    const sp = new URLSearchParams(window.location.search);
    const bookEntry = sp.has("entry") && readParams(sp).entry === null;
    setParams({
      ...Object.fromEntries(RETIRED_PARAMS.map((k) => [k, null])),
      ...(bookEntry ? { entry: null } : {}),
      notice: "reviews",
    });
  }, [params.retiredReviews]);

  const topics = guidance.data?.topics ?? NO_TOPICS;
  const index = useEntryIndex(guidance.data);

  const loaded = guidance.status === "ready";
  const topicOk =
    !params.topic || !loaded || topics.some((t) => t.id === params.topic);
  const topic = topicOk ? params.topic : null;
  const invalid = [
    ...params.invalid.filter((k) => k !== "entry"),
    ...(topicOk ? [] : ["topic"]),
  ];

  const query = useDeferredValue(params.q);
  const result = useBrowse(index, topics, query, topic);

  // Pagination restarts whenever the result set changes.
  const pageKey = [query, topic].join("|");
  const [page, setPage] = useState({ key: "", n: PAGE_SIZE });
  const shownCount = page.key === pageKey ? page.n : PAGE_SIZE;
  const shown = result.results.slice(0, shownCount);

  // ---- Details: opened with a history entry so Back closes them.
  const pushed = useRef<string | null>(null);
  const trigger = useRef<string | null>(null);
  function openEntry(id: string) {
    trigger.current = id;
    pushed.current = id;
    setParams({ entry: id }, { push: true });
  }
  function closeEntry() {
    const current = new URLSearchParams(window.location.search).get("entry");
    if (current === null) return; // already closed (Back, or a repeat close)
    if (pushed.current === current) {
      pushed.current = null;
      window.history.back();
    } else {
      setParams({ entry: null });
    }
  }
  const hasEntry = !!params.entry || params.invalid.includes("entry");
  useEffect(() => {
    if (hasEntry || !trigger.current) return;
    const id = trigger.current;
    trigger.current = null;
    document.querySelector<HTMLElement>(`[data-entry-id="${id}"]`)?.focus();
  }, [hasEntry]);

  type Detail =
    | { kind: "guidance" }
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "unavailable" };
  let detail: Detail | null = null;
  if (params.invalid.includes("entry")) detail = { kind: "unavailable" };
  else if (params.entry) {
    if (entry) detail = { kind: "guidance" };
    else if (guidance.status === "loading") detail = { kind: "loading" };
    else if (guidance.status === "error") detail = { kind: "error" };
    else detail = { kind: "unavailable" };
  }

  const resetFilters = () =>
    setParams({
      topic: null,
      ...Object.fromEntries(invalid.map((k) => [k, null])),
    });
  const clearSearch = () => setParams({ q: null });
  const filtered = !!params.topic;
  const detailTopic = entry ? primaryTopic(entry.topic_ids) : undefined;

  return (
    <div>
      <PageHeader title="Library" />

      {notice && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-well px-3 py-2 text-sm text-ivory-dim"
        >
          Book reviews are no longer part of the household Library. You’re
          viewing Guidance.
          <Button
            size="sm"
            variant="ghost"
            icon={X}
            onClick={() => setParams({ notice: null })}
          >
            Dismiss
          </Button>
        </div>
      )}

      {invalid.length > 0 && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber/30 bg-amber/[0.06] px-3 py-2 text-sm text-ivory-dim"
        >
          Some link settings weren’t recognized and were ignored (
          {invalid.join(", ")}).
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            Reset filters
          </Button>
        </div>
      )}

      {guidance.status === "error" ? (
        <LoadError
          message={guidance.error}
          onRetry={guidance.retry}
          what="guidance"
        />
      ) : guidance.status !== "ready" ? (
        <p role="status" className="surface px-4 py-8 text-center text-sm">
          <span className="text-sage">Loading guidance…</span>
        </p>
      ) : (
        <>
          {guidance.data.rejected > 0 && (
            <p role="status" className="mb-3 text-xs text-amber">
              {fmt(guidance.data.rejected)} record
              {guidance.data.rejected === 1 ? "" : "s"} failed validation and
              {guidance.data.rejected === 1 ? " isn’t" : " aren’t"} shown.
            </p>
          )}

          <div className="mb-3 flex flex-col gap-3">
            <Input
              icon={Search}
              type="search"
              aria-label="Search the Library"
              placeholder="Search guidance — try “boil water”"
              value={params.q}
              onChange={(e) => setParams({ q: e.target.value || null })}
              autoComplete="off"
              spellCheck={false}
              className="h-11"
              wrapperClassName="max-w-xl"
            />

            <div
              role="group"
              aria-label="Topic"
              className="flex flex-wrap gap-2"
            >
              <Pill pressed={!topic} onClick={() => setParams({ topic: null })}>
                All topics
              </Pill>
              {result.topics.map((t) => {
                const n = result.topicCounts.get(t.id) ?? 0;
                const pressed = topic === t.id;
                return (
                  <Pill
                    key={t.id}
                    topicId={t.id}
                    pressed={pressed}
                    disabled={n === 0 && !pressed}
                    onClick={() => setParams({ topic: pressed ? null : t.id })}
                  >
                    {t.label}
                    <span className="text-xs text-slate">{fmt(n)}</span>
                  </Pill>
                );
              })}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-xs text-sage">
              {result.results.length === result.total
                ? `${fmt(result.total)} guidance entries`
                : `${fmt(result.results.length)} of ${fmt(result.total)} guidance entries match`}
              {shown.length < result.results.length &&
                ` · showing ${fmt(shown.length)}`}
            </p>
            {(filtered || params.q) && result.results.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon={RotateCcw}
                onClick={() => {
                  resetFilters();
                  clearSearch();
                }}
              >
                Clear all
              </Button>
            )}
          </div>

          {result.results.length === 0 ? (
            <div className="surface flex flex-col items-center gap-3 px-4 py-8 text-center">
              <p className="text-sm text-ivory-dim">
                {params.q
                  ? `No guidance matches “${params.q}”${filtered ? " with this topic" : ""}.`
                  : "No entries match this topic."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {params.q && (
                  <Button icon={X} onClick={clearSearch}>
                    Clear search
                  </Button>
                )}
                {filtered && (
                  <Button icon={RotateCcw} onClick={resetFilters}>
                    Reset filters
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  topics={topics}
                  onOpen={() => openEntry(e.id)}
                />
              ))}
            </ul>
          )}

          {shown.length < result.results.length && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={() =>
                  setPage({ key: pageKey, n: shownCount + PAGE_SIZE })
                }
              >
                Show more ({fmt(result.results.length - shown.length)}{" "}
                remaining)
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        open={!!detail}
        onClose={closeEntry}
        title={
          detail?.kind === "guidance"
            ? (entry?.title ?? "")
            : detail?.kind === "unavailable"
              ? "Entry unavailable"
              : "Library entry"
        }
        eyebrow={
          detail?.kind === "guidance" && (
            <TopicLabel id={detailTopic} topics={topics} />
          )
        }
        wide
      >
        {detail?.kind === "guidance" && entry && guidance.data && (
          <GuidanceDetail entry={entry} evidence={guidance.data.evidence} />
        )}
        {detail?.kind === "loading" && (
          <p role="status" className="text-sm text-sage">
            Loading entry…
          </p>
        )}
        {detail?.kind === "error" && (
          <LoadError
            message={guidance.error ?? ""}
            onRetry={guidance.retry}
            what="entry"
          />
        )}
        {detail?.kind === "unavailable" && (
          <div className="space-y-4">
            <UnavailableBody />
            <Button icon={Library} onClick={closeEntry}>
              Back to Library
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
