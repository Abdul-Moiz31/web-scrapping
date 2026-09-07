"use client";

import { useEffect, useState } from "react";

import { JsonNode } from "@/components/JsonTree";
import { api } from "@/lib/api";
import { useSources } from "@/lib/SourcesContext";
import { colorForSource, tint } from "@/lib/theme";
import { Change } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;

function formatTimestamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "Unknown time";
}

export default function ChangesPage() {
  const { sources } = useSources();
  const [sourceId, setSourceId] = useState<string>("");
  const [changes, setChanges] = useState<Change[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    function tick() {
      api.changes({ sourceId: sourceId || undefined }).then((data) => {
        if (!cancelled) setChanges(data);
      });
    }

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sourceId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Changes</h2>
          <p className="text-sm text-gray-400">
            Every detected change across all sources, most recent first. Rows that re-scrape
            identical to last time never appear here.
          </p>
        </div>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>

      {changes === null ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : changes.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          No changes detected yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {changes.map((change) => {
            const source = sources.find((s) => s.id === change.source_id);
            const accent = colorForSource(change.source_id, sources);
            return (
              <div
                key={change.id}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: tint(accent, 0.16), color: accent }}
                    >
                      {source?.name ?? change.source_id}
                    </span>
                    <span className="font-mono text-xs text-gray-500">{change.row_identifier}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatTimestamp(change.detected_at)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {Object.entries(change.changed_fields).map(([field, { old, new: next }]) => (
                    <div key={field} className="flex min-w-0 flex-wrap items-start gap-1.5 text-xs">
                      <span className="flex-shrink-0 font-medium text-gray-500">{field}:</span>
                      <div className="min-w-0 text-gray-400 line-through">
                        <JsonNode value={old} />
                      </div>
                      <span className="flex-shrink-0 text-gray-300">→</span>
                      <div className="min-w-0 text-gray-800">
                        <JsonNode value={next} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
