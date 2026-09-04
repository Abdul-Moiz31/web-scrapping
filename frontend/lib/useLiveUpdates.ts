"use client";

import { useEffect, useRef } from "react";

import { api } from "./api";

const POLL_INTERVAL_MS = 5000;

/** Polls GET /sources/{id}/last-updated for the single source currently
 * being viewed -- not the whole source list -- so a cron-triggered scrape
 * that lands while nobody's looking still reaches the screen. Fires
 * onChanged only when the timestamp actually moves from what was last seen,
 * never on the initial read. This is deliberately separate from
 * useTaskSummary's polling, which only runs during an active manual
 * trigger; this one runs whenever the page is open, covering the idle,
 * cron-fired-in-the-background case. */
export function useLiveUpdates(sourceId: string, onChanged: (lastUpdated: string) => void) {
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    const seen = { current: null as string | null };
    let cancelled = false;

    async function tick() {
      const { last_updated } = await api.lastUpdated(sourceId);
      if (cancelled || !last_updated) return;
      if (seen.current !== null && last_updated !== seen.current) {
        onChangedRef.current(last_updated);
      }
      seen.current = last_updated;
    }

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sourceId]);
}
