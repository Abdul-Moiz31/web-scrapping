"use client";

import { useEffect, useState } from "react";

import { api } from "./api";
import { ActivitySeries } from "./types";

const POLL_INTERVAL_MS = 4000;

/** Polls GET /activity every 4s so the overview chart tracks live request
 * volume per source without the viewer refreshing the page. */
export function useActivity(minutes = 30) {
  const [series, setSeries] = useState<ActivitySeries>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const data = await api.activity(minutes);
      if (!cancelled) {
        setSeries(data);
        setLoading(false);
      }
    }

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [minutes]);

  return { series, loading };
}
