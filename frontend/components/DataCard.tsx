import { useState } from "react";

import { Row } from "@/lib/types";
import { tint } from "@/lib/theme";

import { ClockIcon } from "./icons";
import { HistoryModal } from "./HistoryModal";

const IMAGE_KEYS = ["sprite_url", "image_url", "icon_url", "photo_url", "avatar", "avatar_url", "thumbnail", "picture", "logo"];
const IMAGE_URL_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i;
// Priority order for the card's title — checked in this order, not row order,
// so e.g. a coin row's full "name" wins over its short "symbol".
const TITLE_KEYS = ["name", "title", "full_name", "username", "label", "symbol"];
const BADGE_KEYS = ["symbol"];

const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  alive: { fg: "#0ca30c", bg: "#0ca30c1A" },
  dead: { fg: "#d03b3b", bg: "#d03b3b1A" },
  unknown: { fg: "#898781", bg: "#8987811A" },
};

const LABEL_OVERRIDES: Record<string, string> = {
  current_price: "Price",
  market_cap: "Mkt Cap",
  base_experience: "Base XP",
};

function formatLabel(key: string): string {
  return LABEL_OVERRIDES[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isImageKey(key: string, value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  return IMAGE_KEYS.includes(key.toLowerCase()) || IMAGE_URL_PATTERN.test(value);
}

function isPrimitive(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function formatStatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const lower = key.toLowerCase();

  if (typeof value === "number") {
    if (lower.includes("price")) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: value < 1 ? 4 : 2,
        maximumFractionDigits: value < 1 ? 6 : 2,
      }).format(value);
    }
    if (lower.includes("market_cap") || lower.includes("cap")) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(value);
    }
    return value.toLocaleString();
  }
  return String(value);
}

export function DataCard({
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
  const keys = Object.keys(row).filter((k) => k !== "id");
  const imageKey = keys.find((k) => isImageKey(k, row[k]));
  const titleKey = TITLE_KEYS.find((k) => keys.includes(k));
  const badgeKey = BADGE_KEYS.find((k) => keys.includes(k) && k !== titleKey);
  const statusKey = keys.find((k) => k.toLowerCase() === "status");

  const statKeys = keys
    .filter((k) => k !== imageKey && k !== titleKey && k !== statusKey && k !== badgeKey && isPrimitive(row[k]))
    .slice(0, 6);
  const statusValue = statusKey ? String(row[statusKey] ?? "").toLowerCase() : null;
  const statusStyle = statusValue ? STATUS_COLORS[statusValue] ?? STATUS_COLORS.unknown : null;

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-700 hover:-translate-y-0.5 hover:shadow-lg ${
        highlighted ? "border-amber-300 bg-amber-50" : "border-gray-100"
      }`}
    >
      <div
        className="relative flex h-36 items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${tint(accent, 0.14)}, ${tint(accent, 0.03)})` }}
      >
        {imageKey && row[imageKey] ? (
          <img
            src={String(row[imageKey])}
            alt={titleKey ? String(row[titleKey]) : ""}
            loading="lazy"
            className="h-24 w-24 object-contain drop-shadow-sm transition-transform duration-200 group-hover:scale-110"
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
            style={{ backgroundColor: tint(accent, 0.16), color: accent }}
          >
            {titleKey ? String(row[titleKey]).slice(0, 2).toUpperCase() : "—"}
          </div>
        )}
        {statusValue && statusStyle ? (
          <span
            className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
            style={{ color: statusStyle.fg, backgroundColor: statusStyle.bg }}
          >
            {statusValue}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold capitalize text-gray-900">
            {titleKey ? String(row[titleKey]) : `#${String(row.id)}`}
          </h3>
          {badgeKey ? (
            <span
              className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
              style={{ backgroundColor: tint(accent, 0.14), color: accent }}
            >
              {String(row[badgeKey])}
            </span>
          ) : null}
          <button
            onClick={() => setShowHistory(true)}
            title="View history"
            className="ml-auto flex-shrink-0 text-gray-300 hover:text-gray-500"
          >
            <ClockIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {statKeys.map((key) => (
            <div key={key} className="min-w-0">
              <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {formatLabel(key)}
              </div>
              <div className="truncate text-sm font-semibold tabular-nums text-gray-800">
                {formatStatValue(key, row[key])}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showHistory ? (
        <HistoryModal
          sourceId={sourceId}
          rowId={Number(row.id)}
          title={titleKey ? String(row[titleKey]) : `#${String(row.id)}`}
          onClose={() => setShowHistory(false)}
        />
      ) : null}
    </div>
  );
}
