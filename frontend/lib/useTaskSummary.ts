"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "./api";
import { TaskSummary } from "./types";

const POLL_INTERVAL_MS = 2000;

function hasActiveWork(summary: TaskSummary): boolean {
  return Object.values(summary).some(
    (statuses) => (statuses.pending ?? 0) > 0 || (statuses.processing ?? 0) > 0
  );
}

/** Polls GET /tasks/summary every 2s only while there's pending/processing
 * work, and calls onSettle once when it drains back to idle. */
export function useTaskSummary(onSettle?: () => void) {
  const [summary, setSummary] = useState<TaskSummary>({});
  const [polling, setPolling] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api.taskSummary();
    setSummary(data);
    return data;
  }, []);

  useEffect(() => {
    refresh().then((data) => {
      if (hasActiveWork(data)) setPolling(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      const data = await refresh();
      if (!hasActiveWork(data)) {
        setPolling(false);
        onSettle?.();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [polling, refresh, onSettle]);

  const startPolling = useCallback(() => setPolling(true), []);

  return { summary, polling, startPolling, refresh };
}
