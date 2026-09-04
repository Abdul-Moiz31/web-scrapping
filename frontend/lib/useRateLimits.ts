"use client";

import { useEffect, useState } from "react";

import { api } from "./api";
import { RateLimit, SourceInfo } from "./types";

const POLL_INTERVAL_MS = 2000;

/** Fetches each source's current-minute rate-limit counter once, then keeps
 * polling every 2s while `active` is true (mirrors useTaskSummary's cadence
 * so both panels update in lockstep during a run). */
export function useRateLimits(sources: SourceInfo[], active: boolean) {
  const [rateLimits, setRateLimits] = useState<Record<string, RateLimit>>({});

  useEffect(() => {
    if (sources.length === 0) return;
    let cancelled = false;

    async function tick() {
      const entries = await Promise.all(
        sources.map(async (source) => [source.id, await api.rateLimit(source.id)] as const)
      );
      if (!cancelled) setRateLimits(Object.fromEntries(entries));
    }

    tick();
    if (!active) return () => {
      cancelled = true;
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sources, active]);

  return rateLimits;
}
