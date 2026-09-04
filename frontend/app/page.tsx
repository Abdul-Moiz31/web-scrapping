"use client";

import { useEffect, useMemo, useState } from "react";

import { ActivityChart } from "@/components/ActivityChart";
import { FailedTasksPanel } from "@/components/FailedTasksPanel";
import { BoltIcon, DatabaseIcon, QueueIcon } from "@/components/icons";
import { SourceCard } from "@/components/SourceCard";
import { StatCard } from "@/components/StatCard";
import { TaskQueuePanel } from "@/components/TaskQueuePanel";
import { api } from "@/lib/api";
import { useSources } from "@/lib/SourcesContext";
import { useActivity } from "@/lib/useActivity";
import { useRateLimits } from "@/lib/useRateLimits";
import { useTaskSummary } from "@/lib/useTaskSummary";
import { FailedTask } from "@/lib/types";

export default function DashboardPage() {
  const { sources, loading } = useSources();
  const [refreshSignal, setRefreshSignal] = useState(0);
  const bumpRefresh = () => setRefreshSignal((s) => s + 1);

  const { summary, polling, startPolling, refresh } = useTaskSummary(bumpRefresh);
  const rateLimits = useRateLimits(sources, polling);
  const { series: activitySeries, loading: activityLoading } = useActivity(30);

  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (sources.length === 0) return;
    Promise.all(sources.map((s) => api.sourceCount(s.id))).then((results) => {
      setCounts(Object.fromEntries(results.map((r) => [r.source_id, r.count])));
    });
  }, [sources, refreshSignal]);

  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([]);
  useEffect(() => {
    api.failedTasks().then(setFailedTasks);
  }, [refreshSignal, summary]);

  const totalRecords = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);
  const requestsThisMinute = useMemo(
    () => Object.values(rateLimits).reduce((a, r) => a + r.count, 0),
    [rateLimits]
  );
  const queueTotals = useMemo(() => {
    let pending = 0;
    let processing = 0;
    let done = 0;
    for (const statuses of Object.values(summary)) {
      pending += statuses.pending ?? 0;
      processing += statuses.processing ?? 0;
      done += statuses.done ?? 0;
    }
    return { pending, processing, done };
  }, [summary]);

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total records"
          value={totalRecords.toLocaleString()}
          sublabel={`Across ${sources.length} sources`}
          icon={<DatabaseIcon className="h-5 w-5" />}
          accent="#2a78d6"
        />
        <StatCard
          label="Requests this minute"
          value={requestsThisMinute.toLocaleString()}
          sublabel={polling ? "Scrape in progress" : "Idle — no active run"}
          icon={<BoltIcon className="h-5 w-5" />}
          accent="#eb6834"
        />
        <StatCard
          label="Queue activity"
          value={(queueTotals.pending + queueTotals.processing).toLocaleString()}
          sublabel={`${queueTotals.done.toLocaleString()} completed all-time`}
          icon={<QueueIcon className="h-5 w-5" />}
          accent="#1baf7a"
        />
      </section>

      <section>
        <ActivityChart series={activitySeries} sources={sources} loading={activityLoading} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Task Queue
        </h2>
        <TaskQueuePanel summary={summary} />
      </section>

      {failedTasks.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Failed Tasks
          </h2>
          <FailedTasksPanel tasks={failedTasks} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Sources
        </h2>
        {loading ? (
          <div className="text-sm text-gray-400">Loading sources…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                rateLimit={rateLimits[source.id]}
                refreshSignal={refreshSignal}
                onTriggered={startPolling}
                onStopped={() => {
                  refresh();
                  bumpRefresh();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
