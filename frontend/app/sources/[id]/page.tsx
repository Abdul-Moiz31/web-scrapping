"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { DataCardGrid } from "@/components/DataCardGrid";
import { FailedTasksPanel } from "@/components/FailedTasksPanel";
import { AlertTriangleIcon, ArrowLeftIcon, ClockIcon, DatabaseIcon, TrashIcon } from "@/components/icons";
import { JsonRowGrid } from "@/components/JsonRowGrid";
import { PaginationStatusBadge, PaginationWarningBanner } from "@/components/PaginationStatusBadge";
import { RateLimitBadge } from "@/components/RateLimitBadge";
import { StatCard } from "@/components/StatCard";
import { StopButton } from "@/components/StopButton";
import { TaskQueuePanel } from "@/components/TaskQueuePanel";
import { TriggerButton } from "@/components/TriggerButton";
import { api } from "@/lib/api";
import { useSources } from "@/lib/SourcesContext";
import { colorForSource, tint } from "@/lib/theme";
import { FailedTask, Row, SourceStats } from "@/lib/types";
import { useLiveUpdates } from "@/lib/useLiveUpdates";
import { useRateLimits } from "@/lib/useRateLimits";
import { useTaskSummary } from "@/lib/useTaskSummary";

const LIVE_ROWS_POLL_MS = 3000;
// How long a changed row stays visually highlighted after a background poll
// picks it up -- long enough to notice, short enough to not linger.
const HIGHLIGHT_MS = 1600;

function formatLastRun(iso: string | null): string {
  if (!iso) return "Never run";
  return new Date(iso).toLocaleString();
}

export default function SourceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sourceId = params.id;
  const { sources, refresh: refreshSources } = useSources();
  const source = sources.find((s) => s.id === sourceId);
  const accent = colorForSource(sourceId, sources);

  const [rows, setRows] = useState<Row[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState<SourceStats | null>(null);
  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([]);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  // Baseline for "which rows changed" -- the last-updated timestamp as of
  // the most recent render, so a background poll can tell which rows are
  // newer than what's currently on screen.
  const lastSeenUpdatedRef = useRef<string | null>(null);

  const fetchRows = useCallback(async () => {
    const data = await api.sourceRows(sourceId);
    setRows(data);
  }, [sourceId]);

  // Refetches everything and, if this isn't the first load, flags rows
  // newer than the last render for a brief highlight -- the visible proof
  // that a cron-triggered poll actually reached the screen.
  const refreshAll = useCallback(async () => {
    const [freshRows, statsData, allFailed] = await Promise.all([
      api.sourceRows(sourceId),
      api.sourceStats(sourceId),
      api.failedTasks(),
    ]);

    const prevThreshold = lastSeenUpdatedRef.current;
    if (prevThreshold) {
      const changed = freshRows
        .filter((r) => typeof r.updated_at === "string" && new Date(r.updated_at) > new Date(prevThreshold))
        .map((r) => String(r.id));
      if (changed.length > 0) {
        setHighlightedIds(new Set(changed));
        setTimeout(() => setHighlightedIds(new Set()), HIGHLIGHT_MS);
      }
    }
    lastSeenUpdatedRef.current = statsData.last_updated_at;

    setRows(freshRows);
    setStats(statsData);
    setFailedTasks(allFailed.filter((t) => t.payload.source === sourceId));
  }, [sourceId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const { summary, polling, startPolling, refresh } = useTaskSummary(refreshAll);
  const rateLimits = useRateLimits(source ? [source] : [], polling);

  // Background poll for the idle-page case: a cron job upserts rows while
  // this page just sits open. While a manual trigger is actively polling
  // above, that flow already refreshes rows/stats, so skip the extra fetch
  // here and just keep the baseline in sync.
  useLiveUpdates(sourceId, (newLastUpdated) => {
    if (polling) {
      lastSeenUpdatedRef.current = newLastUpdated;
      return;
    }
    refreshAll();
  });

  // While a scrape is in flight, keep pulling fresh rows so new cards
  // appear as they're saved instead of waiting for the whole run to settle.
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(fetchRows, LIVE_ROWS_POLL_MS);
    return () => clearInterval(interval);
  }, [polling, fetchRows]);

  async function handleDelete() {
    if (!confirm(`Remove "${source?.name}"? This deletes its scraped data too.`)) return;
    setDeleting(true);
    try {
      await api.deleteCustomSource(sourceId);
      await refreshSources();
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  if (!source) {
    return <div className="text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to overview
      </Link>

      <div
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 p-5 shadow-sm"
        style={{ background: `linear-gradient(135deg, ${tint(accent, 0.1)}, white)` }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold"
            style={{ backgroundColor: tint(accent, 0.18), color: accent }}
          >
            {source.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{source.name}</h2>
              {source.is_custom ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ backgroundColor: tint(accent, 0.16), color: accent }}
                >
                  Custom API
                </span>
              ) : null}
              {source.is_custom ? <PaginationStatusBadge status={source.pagination_status} /> : null}
            </div>
            <p className="text-sm text-gray-400">
              {rows.length.toLocaleString()} rows &middot; schedule{" "}
              <span className="font-mono">{source.cron_schedule}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RateLimitBadge rateLimit={rateLimits[source.id]} />
          <TriggerButton sourceId={source.id} onTriggered={startPolling} />
          <StopButton
            sourceId={source.id}
            onStopped={() => {
              refresh();
              refreshAll();
            }}
          />
          {source.is_custom ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Remove this custom source"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-500 shadow-sm transition-colors hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {source.is_custom ? <PaginationWarningBanner status={source.pagination_status} /> : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total rows"
          value={(stats?.row_count ?? rows.length).toLocaleString()}
          icon={<DatabaseIcon className="h-5 w-5" />}
          accent={accent}
        />
        <StatCard
          label="Last successful run"
          value={
            <span className="text-lg">{stats ? formatLastRun(stats.last_run_at) : "…"}</span>
          }
          icon={<ClockIcon className="h-5 w-5" />}
          accent={accent}
        />
        <StatCard
          label="Last updated"
          sublabel="Freshest scraped row"
          value={
            <span className="text-lg">{stats ? formatLastRun(stats.last_updated_at) : "…"}</span>
          }
          icon={<ClockIcon className="h-5 w-5" />}
          accent={accent}
        />
        <StatCard
          label="Failed tasks"
          value={stats?.failed_count ?? 0}
          icon={<AlertTriangleIcon className="h-5 w-5" />}
          accent={accent}
        />
      </section>

      <TaskQueuePanel summary={summary} />

      <FailedTasksPanel tasks={failedTasks} />

      {source.is_custom ? (
        <JsonRowGrid rows={rows} accent={accent} highlightedIds={highlightedIds} sourceId={sourceId} />
      ) : (
        <DataCardGrid rows={rows} accent={accent} highlightedIds={highlightedIds} sourceId={sourceId} />
      )}
    </div>
  );
}
