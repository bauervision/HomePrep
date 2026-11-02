"use client";

import { BookOpen, Library, RotateCcw, Search, X } from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Button,
  cx,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import {
  browse,
  PAGE_SIZE,
  readParams,
  type Collection,
  type Filters,
} from "@/lib/library/browse";
import { formatDate, STATUS_LABEL, STATUS_PARAM } from "@/lib/library/format";
import { useGuidance, useReviewsIndex } from "@/lib/library/load";
import { buildIndex, type Indexed } from "@/lib/library/search";
import type {
  DisplayStatus,
  EntryBase,
  LibrarySource,
  LibraryTopic,
} from "@/lib/library/types";
import { setParams, useSearch } from "@/lib/url-state";
import {
  BookReviewDetail,
  GuidanceDetail,
  LoadError,
  StatusBadge,
  UnavailableBody,
} from "./LibraryDetail";

/*
 * Read-only Library: authority-supported guidance by default, with book
 * reviews as a separate research collection. All state lives in the URL
 * (view, q, topic, book, status, entry). Nothing here touches household data.
 */

const BOOK_STATUSES: DisplayStatus[] = [
  "verified_principle",
  "source_reference",
  "needs_review",
  "unavailable",
];

const NO_TOPICS: LibraryTopic[] = [];

const fmt = (n: number) => n.toLocaleString("en-US");

function Pill({
  pressed,
  disabled,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber sm:min-h-9",
        pressed
          ? "border-copper-light/70 bg-copper/15 font-medium text-ivory"
          : "border-line text-ivory-dim hover:border-line-strong hover:text-ivory",
        disabled && "cursor-not-allowed opacity-40 hover:border-line",
      )}
    >
      {pressed && (
        <span aria-hidden className="size-1.5 rounded-full bg-copper-light" />
      )}
      {children}
    </button>
  );
}

function EntryCard({
  entry,
  topics,
  sourceTitle,
  onOpen,
}: {
  entry: EntryBase;
  topics: LibraryTopic[];
  sourceTitle: string;
  onOpen: () => void;
}) {
  const topicLabels = entry.topic_ids
    .map((id) => topics.find((t) => t.id === id)?.label ?? id)
    .join(", ");
  return (
    <li className="min-w-0">
      <button
        type="button"
        data-entry-id={entry.id}
        aria-haspopup="dialog"
        onClick={onOpen}
        className="surface flex h-full w-full flex-col items-start gap-2 p-4 text-left outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-amber"
      >
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
          <span className="text-xs text-slate">
            {topicLabels}
            {" · "}
            {sourceTitle}
            {entry.reviewed_on && (
              <> · Reviewed {formatDate(entry.reviewed_on)}</>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Search index for a loaded collection, built once per payload. */
function useEntryIndex(
  data: { entries: EntryBase[]; topics: LibraryTopic[] } | null,
): Indexed<EntryBase>[] {
  return useMemo(
    () => (data ? buildIndex<EntryBase>(data.entries, data.topics) : []),
    [data],
  );
}

function useBrowse(
  index: Indexed<EntryBase>[],
  topics: LibraryTopic[],
  query: string,
  topic: string | null,
  book: string | null,
  status: DisplayStatus | null,
) {
  return useMemo(
    () => browse(index, topics, query, { topic, book, status }),
    [index, topics, query, topic, book, status],
  );
}

type Detail =
  | { kind: "guidance"; id: string }
  | { kind: "book"; id: string }
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: () => void }
  | { kind: "unavailable" };

export function LibraryView() {
  const params = readParams(useSearch());
  const guidance = useGuidance();
  const guidanceEntry = params.entry
    ? guidance.data?.entries.find((e) => e.id === params.entry)
    : undefined;
  // The review index loads on entering Book reviews, or to resolve a direct
  // link to an entry that isn't core guidance.
  const needIndex =
    params.view === "reviews" ||
    (!!params.entry && guidance.status !== "loading" && !guidanceEntry);
  const index = useReviewsIndex(needIndex);
  const bookEntry =
    params.entry && !guidanceEntry
      ? index.data?.entries.find((e) => e.id === params.entry)
      : undefined;

  // A book entry always shows in its own collection, never as guidance.
  const view: Collection = bookEntry ? "reviews" : params.view;
  useEffect(() => {
    if (bookEntry && params.view !== "reviews") setParams({ view: "reviews" });
  }, [bookEntry, params.view]);

  const active = view === "guidance" ? guidance : index;
  const topics = active.data?.topics ?? NO_TOPICS;
  const sources: LibrarySource[] =
    view === "guidance"
      ? guidance.data
        ? [guidance.data.source]
        : []
      : (index.data?.sources ?? []);
  const sourceTitle = (id: string) =>
    id === "CORE"
      ? "HomePrep authoritative core"
      : (sources.find((s) => s.id === id)?.title ?? id);

  const guidanceIndex = useEntryIndex(guidance.data);
  const reviewsIndex = useEntryIndex(index.data);
  const searchIndex = view === "guidance" ? guidanceIndex : reviewsIndex;

  const loaded = active.status === "ready";
  const topicOk =
    !params.topic || !loaded || topics.some((t) => t.id === params.topic);
  const bookOk =
    view !== "reviews" ||
    !params.book ||
    !loaded ||
    sources.some((s) => s.id === params.book);
  const filters: Filters = {
    topic: topicOk ? params.topic : null,
    book: view === "reviews" && bookOk ? params.book : null,
    status: view === "reviews" ? params.status : null,
  };
  const invalid = [
    ...params.invalid.filter((k) => k !== "entry"),
    ...(topicOk ? [] : ["topic"]),
    ...(bookOk ? [] : ["book"]),
  ];

  const query = useDeferredValue(params.q);
  const { topic, book, status } = filters;
  const result = useBrowse(searchIndex, topics, query, topic, book, status);

  // Pagination restarts whenever the result set changes.
  const pageKey = [view, query, topic, book, status].join("|");
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

  let detail: Detail | null = null;
  if (params.invalid.includes("entry")) detail = { kind: "unavailable" };
  else if (params.entry) {
    if (guidanceEntry) detail = { kind: "guidance", id: guidanceEntry.id };
    else if (bookEntry) detail = { kind: "book", id: bookEntry.id };
    else if (guidance.status === "loading" || index.status === "loading")
      detail = { kind: "loading" };
    else if (index.status === "error")
      detail = { kind: "error", message: index.error, retry: index.retry };
    else if (guidance.status === "error" && index.status === "ready")
      detail = {
        kind: "error",
        message: guidance.error,
        retry: guidance.retry,
      };
    else detail = { kind: "unavailable" };
  }

  function chooseView(next: Collection) {
    if (next === view) return;
    setParams(
      {
        view: next === "guidance" ? null : next,
        book: null,
        status: null,
        entry: null,
      },
      { push: true },
    );
  }
  const resetFilters = () =>
    setParams({
      topic: null,
      book: null,
      status: null,
      ...Object.fromEntries(invalid.map((k) => [k, null])),
    });
  const clearSearch = () => setParams({ q: null });
  const filtered = !!(params.topic || params.book || params.status);

  const intro =
    view === "guidance" ? (
      <p>
        Authority-supported guidance: checked against the cited sources, with
        HomePrep editorial applications. Quantities are an{" "}
        <strong className="text-ivory">example plan for five people</strong>,
        not your household; household completion isn’t assessed.
        {guidance.data && guidance.data.scenario.notes.length > 0 && (
          <span className="mt-1 block text-xs text-slate">
            Example scenario:{" "}
            {guidance.data.scenario.people !== null &&
              `${guidance.data.scenario.people} people · `}
            {guidance.data.scenario.notes
              .map((n) => `${n.label}: ${n.value}`)
              .join(" · ")}
          </span>
        )}
      </p>
    ) : (
      <p>
        Research records from examined books, kept separate from guidance. Many
        include unresolved claims: every record keeps its review label, and book
        material is not approved instructions.
      </p>
    );

  const modalTitle =
    detail?.kind === "guidance"
      ? (guidanceEntry?.title ?? "")
      : detail?.kind === "book"
        ? (bookEntry?.title ?? "")
        : detail?.kind === "unavailable"
          ? "Entry unavailable"
          : "Library entry";

  return (
    <div>
      <PageHeader
        title="Library"
        sub="Read-only reference. Reading never changes your household plan, tasks or readiness."
      />

      <div
        role="group"
        aria-label="Collection"
        className="mb-3 inline-flex flex-wrap gap-1 rounded-xl border border-line bg-well p-1"
      >
        {(
          [
            ["guidance", "Guidance", Library, guidance.data?.entries.length],
            ["reviews", "Book reviews", BookOpen, index.data?.entries.length],
          ] as const
        ).map(([key, label, Icon, count]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => chooseView(key)}
            className={cx(
              "flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber sm:min-h-9",
              view === key
                ? "bg-white/[0.07] font-medium text-ivory shadow-[inset_0_-2px_0_var(--color-copper-light)]"
                : "text-sage hover:text-ivory",
            )}
          >
            <Icon
              size={16}
              aria-hidden
              className={view === key ? "text-copper-light" : "text-slate"}
            />
            {label}
            {count !== undefined && (
              <span className="text-xs text-slate">{fmt(count)}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-4 max-w-3xl text-sm leading-relaxed text-ivory-dim">
        {intro}
      </div>

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

      {active.status === "error" ? (
        <LoadError
          message={active.error}
          onRetry={active.retry}
          what={view === "guidance" ? "guidance" : "book review index"}
        />
      ) : active.status !== "ready" ? (
        <p role="status" className="surface px-4 py-8 text-center text-sm">
          <span className="text-sage">
            {view === "guidance"
              ? "Loading guidance…"
              : "Loading book reviews…"}
          </span>
        </p>
      ) : (
        <>
          {active.data.rejected > 0 && (
            <p role="status" className="mb-3 text-xs text-amber">
              {fmt(active.data.rejected)} record
              {active.data.rejected === 1 ? "" : "s"} failed validation and
              {active.data.rejected === 1 ? " isn’t" : " aren’t"} shown.
            </p>
          )}

          <div className="mb-3 flex flex-col gap-3">
            <Input
              icon={Search}
              type="search"
              aria-label="Search the Library"
              placeholder={
                view === "guidance"
                  ? "Search guidance — try “boil water”"
                  : "Search book reviews"
              }
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
              <Pill
                pressed={!filters.topic}
                onClick={() => setParams({ topic: null })}
              >
                All topics
              </Pill>
              {result.topics.map((t) => {
                const n = result.topicCounts.get(t.id) ?? 0;
                const pressed = filters.topic === t.id;
                return (
                  <Pill
                    key={t.id}
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

            {view === "reviews" && (
              <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-2">
                <Field label="Book">
                  <Select
                    value={filters.book ?? ""}
                    onChange={(e) =>
                      setParams({ book: e.target.value || null })
                    }
                    className="h-11"
                  >
                    <option value="">All books</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({fmt(result.bookCounts.get(s.id) ?? 0)})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Review status">
                  <Select
                    value={filters.status ? STATUS_PARAM[filters.status] : ""}
                    onChange={(e) =>
                      setParams({ status: e.target.value || null })
                    }
                    className="h-11"
                  >
                    <option value="">All review statuses</option>
                    {BOOK_STATUSES.filter(
                      (s) =>
                        s !== "unavailable" ||
                        index.data?.entries.some((e) => e.status === s),
                    ).map((s) => (
                      <option key={s} value={STATUS_PARAM[s]}>
                        {STATUS_LABEL[s]} (
                        {fmt(result.statusCounts.get(s) ?? 0)})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-xs text-sage">
              {result.results.length === result.total
                ? `${fmt(result.total)} ${view === "guidance" ? "guidance entries" : "book review records"}`
                : `${fmt(result.results.length)} of ${fmt(result.total)} ${view === "guidance" ? "guidance entries" : "book review records"} match`}
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
                  ? `No ${view === "guidance" ? "guidance" : "book reviews"} match “${params.q}”${filtered ? " with these filters" : ""}.`
                  : "No entries match these filters."}
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
                  sourceTitle={sourceTitle(e.source_id)}
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

      <Modal open={!!detail} onClose={closeEntry} title={modalTitle} wide>
        {detail?.kind === "guidance" && guidanceEntry && guidance.data && (
          <GuidanceDetail
            entry={guidanceEntry}
            topics={guidance.data.topics}
            evidence={guidance.data.evidence}
          />
        )}
        {detail?.kind === "book" && bookEntry && index.data && (
          <BookReviewDetail
            key={bookEntry.id}
            entry={bookEntry}
            source={index.data.sources.find(
              (s) => s.id === bookEntry.source_id,
            )}
            topics={index.data.topics}
          />
        )}
        {detail?.kind === "loading" && (
          <p role="status" className="text-sm text-sage">
            Loading entry…
          </p>
        )}
        {detail?.kind === "error" && (
          <LoadError
            message={detail.message}
            onRetry={detail.retry}
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
