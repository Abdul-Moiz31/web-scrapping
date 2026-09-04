"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useSources } from "@/lib/SourcesContext";
import { colorForSource, tint } from "@/lib/theme";
import { RateLimit, SourceInfo } from "@/lib/types";

import { RateLimitBadge } from "./RateLimitBadge";
import { StopButton } from "./StopButton";
import { TriggerButton } from "./TriggerButton";

export function SourceCard({
  source,
  rateLimit,
  refreshSignal,
  onTriggered,
  onStopped,
}: {
  source: SourceInfo;
  rateLimit: RateLimit | undefined;
  refreshSignal: number;
  onTriggered: () => void;
  onStopped: () => void;
}) {
  const { sources } = useSources();
  const accent = colorForSource(source.id, sources);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    api.sourceCount(source.id).then((data) => setCount(data.count));
  }, [source.id, refreshSignal]);

  return (
    <div className="group flex flex-col gap-4 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold"
            style={{ backgroundColor: tint(accent, 0.16), color: accent }}
          >
            {source.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{source.name}</h3>
            <p className="text-xs text-gray-400">{source.table_name}</p>
          </div>
        </div>
        <RateLimitBadge rateLimit={rateLimit} />
      </div>

      <div className="text-3xl font-bold tabular-nums text-gray-900">
        {count === null ? "—" : count.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-gray-400">rows</span>
      </div>

      <div className="text-xs text-gray-400">
        Schedule: <span className="font-mono">{source.cron_schedule}</span>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TriggerButton sourceId={source.id} onTriggered={onTriggered} />
          <StopButton sourceId={source.id} onStopped={onStopped} />
        </div>
        <Link
          href={`/sources/${source.id}`}
          className="text-sm font-medium hover:underline"
          style={{ color: accent }}
        >
          View collection →
        </Link>
      </div>
    </div>
  );
}
