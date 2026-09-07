"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { HistoryEntry } from "@/lib/types";

import { JsonNode } from "./JsonTree";

function formatTimestamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "Unknown time";
}

/** Minimal history viewer for one row -- a modal rather than a dedicated
 * page/route, since this stage only needs the data to exist and be
 * reachable, not a polished browsing experience. */
export function HistoryModal({
  sourceId,
  rowId,
  title,
  onClose,
}: {
  sourceId: string;
  rowId: number;
  title: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.rowHistory(sourceId, rowId).then((data) => {
      if (cancelled) return;
      setEntries(data);
      setSelected(data[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId, rowId]);

  const selectedEntry = entries?.find((e) => e.id === selected) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">History &middot; {title}</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700">
            Close
          </button>
        </div>

        {entries === null ? (
          <div className="p-5 text-sm text-gray-400">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-5 text-sm text-gray-400">No history recorded yet.</div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="w-40 flex-shrink-0 overflow-y-auto border-r border-gray-100">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelected(entry.id)}
                  className={`block w-full truncate px-3 py-2 text-left text-xs ${
                    entry.id === selected ? "bg-brand-50 font-semibold text-brand-700" : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {formatTimestamp(entry.recorded_at)}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedEntry ? (
                <div className="flex flex-col gap-1.5">
                  {Object.entries(selectedEntry.data).map(([key, value]) => (
                    <JsonNode key={key} label={key} value={value} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
