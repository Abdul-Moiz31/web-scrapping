"use client";

import { useMemo, useState } from "react";

import { Row } from "@/lib/types";

import { JsonRow } from "./JsonRow";
import { SearchIcon } from "./icons";

const PAGE_SIZE = 30;

/** Same search/pagination shell as DataCardGrid, but for custom sources'
 * untyped JSON rows -- kept as a separate component rather than folding into
 * DataCardGrid because the search predicate and the card itself are
 * genuinely different (raw JSON substring match vs primitive-field match,
 * key/value tree vs image+title card). */
export function JsonRowGrid({
  rows,
  accent,
  highlightedIds,
}: {
  rows: Row[];
  accent: string;
  highlightedIds?: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) => JSON.stringify(row.data).toLowerCase().includes(q));
  }, [rows, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
        No rows yet — run a scrape to populate this collection.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search this collection…"
            className="w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <span className="whitespace-nowrap text-xs text-gray-400">
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          No matches for &ldquo;{query}&rdquo;
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paged.map((row) => (
              <JsonRow
                key={String(row.id)}
                row={row}
                accent={accent}
                highlighted={highlightedIds?.has(String(row.id))}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-gray-400">
                Page {currentPage} of {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
