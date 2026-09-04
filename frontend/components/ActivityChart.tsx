"use client";

import { useMemo, useRef, useState } from "react";

import { ActivitySeries, SourceInfo } from "@/lib/types";
import { colorForSource, tint } from "@/lib/theme";

const WIDTH = 720;
const HEIGHT = 220;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

function formatMinute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ActivityChart({
  series,
  sources,
  loading,
}: {
  series: ActivitySeries;
  sources: SourceInfo[];
  loading: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const sourceIds = sources.map((s) => s.id).filter((id) => series[id]);
  const minutes = sourceIds.length > 0 ? series[sourceIds[0]].map((p) => p.minute) : [];
  const n = minutes.length;

  const maxCount = useMemo(() => {
    let max = 1;
    for (const id of sourceIds) {
      for (const p of series[id] ?? []) max = Math.max(max, p.count);
    }
    return max;
  }, [series, sourceIds]);

  const totalNow = useMemo(
    () => sourceIds.reduce((sum, id) => sum + (series[id]?.at(-1)?.count ?? 0), 0),
    [series, sourceIds]
  );

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xAt = (i: number) => PAD_LEFT + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD_TOP + plotH - (v / maxCount) * plotH;

  function pathFor(id: string): string {
    const points = series[id] ?? [];
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p.count).toFixed(2)}`).join(" ");
  }

  function areaFor(id: string): string {
    const points = series[id] ?? [];
    if (points.length === 0) return "";
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p.count).toFixed(2)}`).join(" ");
    return `${line} L ${xAt(points.length - 1).toFixed(2)} ${yAt(0).toFixed(2)} L ${xAt(0).toFixed(2)} ${yAt(0).toFixed(2)} Z`;
  }

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (n === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const svgX = fracX * WIDTH;
    const rel = (svgX - PAD_LEFT) / plotW;
    const idx = Math.round(rel * (n - 1));
    setHoverIdx(Math.min(n - 1, Math.max(0, idx)));
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900">Live request activity</h3>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">
            Requests per minute, per source &middot; last {n || "…"} min &middot;{" "}
            <span className="font-semibold text-gray-600">{totalNow}</span> this minute
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {sourceIds.map((id) => {
            const color = colorForSource(id, sources);
            const name = sources.find((s) => s.id === id)?.name ?? id;
            return (
              <div key={id} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {name}
              </div>
            );
          })}
        </div>
      </div>

      {loading || n === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">
          Waiting for activity data…
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {gridLines.map((f) => (
            <line
              key={f}
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={PAD_TOP + plotH * f}
              y2={PAD_TOP + plotH * f}
              stroke="#e1e0d9"
              strokeWidth={1}
            />
          ))}

          {[0, Math.floor(n / 2), n - 1].map((i) => (
            <text key={i} x={xAt(i)} y={HEIGHT - 6} fontSize={10} fill="#898781" textAnchor="middle">
              {formatMinute(minutes[i])}
            </text>
          ))}

          {sourceIds.map((id) => {
            const color = colorForSource(id, sources);
            return <path key={`area-${id}`} d={areaFor(id)} fill={tint(color, 0.08)} stroke="none" />;
          })}

          {sourceIds.map((id) => {
            const color = colorForSource(id, sources);
            return (
              <path
                key={`line-${id}`}
                d={pathFor(id)}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {hoverIdx !== null ? (
            <>
              <line
                x1={xAt(hoverIdx)}
                x2={xAt(hoverIdx)}
                y1={PAD_TOP}
                y2={PAD_TOP + plotH}
                stroke="#c3c2b7"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {sourceIds.map((id) => {
                const color = colorForSource(id, sources);
                const point = series[id]?.[hoverIdx];
                if (!point) return null;
                return (
                  <circle
                    key={`dot-${id}`}
                    cx={xAt(hoverIdx)}
                    cy={yAt(point.count)}
                    r={3.5}
                    fill={color}
                    stroke="#fcfcfb"
                    strokeWidth={1.5}
                  />
                );
              })}
            </>
          ) : null}
        </svg>
      )}

      {hoverIdx !== null && n > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs">
          <span className="font-semibold text-gray-500">{formatMinute(minutes[hoverIdx])}</span>
          {sourceIds.map((id) => {
            const color = colorForSource(id, sources);
            const name = sources.find((s) => s.id === id)?.name ?? id;
            const count = series[id]?.[hoverIdx]?.count ?? 0;
            return (
              <span key={id} className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                {name}: {count}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
