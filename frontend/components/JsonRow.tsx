import { useState } from "react";

import { Row } from "@/lib/types";

import { HistoryModal } from "./HistoryModal";
import { JsonNode } from "./JsonTree";
import { ClockIcon } from "./icons";

// Mirrors backend/app/sources/custom.py's ID_KEYS -- checked in the same
// order so the header shown here matches the natural key _item_key()
// actually picked, whenever that key came from a real field rather than a
// content-hash fallback (which isn't "readable" enough to show as a title).
const ID_KEYS = ["id", "uuid", "_id", "slug", "key"];

function pickHeader(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const key of ID_KEYS) {
      const value = obj[key];
      if (typeof value === "string" || typeof value === "number") return String(value);
    }
    const firstString = Object.values(obj).find((v) => typeof v === "string" && v.trim() !== "");
    if (typeof firstString === "string") return firstString;
  }
  return fallback;
}

export function JsonRow({
  row,
  accent,
  highlighted,
  sourceId,
}: {
  row: Row;
  accent: string;
  highlighted?: boolean;
  sourceId: string;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const data = row.data;
  const itemKey = typeof row.item_key === "string" ? row.item_key : undefined;
  const header = pickHeader(data, itemKey ?? `Row #${String(row.id)}`);
  const entries: [string, unknown][] =
    data && typeof data === "object" && !Array.isArray(data)
      ? Object.entries(data as Record<string, unknown>)
      : [["value", data]];

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm transition-all duration-700 ${
        highlighted ? "border-amber-300 bg-amber-50" : "border-gray-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-semibold" style={{ color: accent }}>
          {header}
        </div>
        <button
          onClick={() => setShowHistory(true)}
          title="View history"
          className="flex-shrink-0 text-gray-300 hover:text-gray-500"
        >
          <ClockIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {entries.map(([key, value]) => (
          <JsonNode key={key} label={key} value={value} />
        ))}
      </div>

      {showHistory ? (
        <HistoryModal
          sourceId={sourceId}
          rowId={Number(row.id)}
          title={header}
          onClose={() => setShowHistory(false)}
        />
      ) : null}
    </div>
  );
}
