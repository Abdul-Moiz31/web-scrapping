import { PaginationStatus } from "@/lib/types";

import { AlertTriangleIcon } from "./icons";

const STATUS_META: Record<string, { label: string; className: string }> = {
  following: { label: "Paginated", className: "bg-emerald-100 text-emerald-700" },
  single_page: { label: "Single page", className: "bg-gray-100 text-gray-600" },
  possibly_incomplete: { label: "Possibly incomplete", className: "bg-amber-100 text-amber-800" },
  page_cap_hit: { label: "Pagination cap hit", className: "bg-amber-100 text-amber-800" },
};

/** Small pill next to the source name -- always shown once a discover run
 * has recorded a status, so "how did this source's pagination resolve" is
 * visible at a glance even when everything's fine. */
export function PaginationStatusBadge({ status }: { status: PaginationStatus }) {
  if (!status) return null;
  const meta = STATUS_META[status];
  if (!meta) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

const WARNING_MESSAGES: Record<string, string> = {
  possibly_incomplete:
    "This API reports a total count, but no pagination mechanism was detected on its response. Some rows may be unreachable.",
  page_cap_hit: "Pagination stopped after the 50-page safety cap. More pages may remain unfetched.",
};

/** The actual point of Stage 10: this can't be a badge you have to notice --
 * a "possibly more data exists but we can't reach it" state gets a banner,
 * not a pill. */
export function PaginationWarningBanner({ status }: { status: PaginationStatus }) {
  const message = status ? WARNING_MESSAGES[status] : undefined;
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangleIcon className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
