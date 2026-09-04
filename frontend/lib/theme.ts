import { SourceInfo } from "./types";

/** Fixed-order categorical palette (validated for CVD-safe adjacent contrast).
 * Assigned by each source's position in the sources list — never reassigned
 * by filtering/sorting, so a series keeps its color as data changes. */
export const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

export function colorForSource(sourceId: string, sources: SourceInfo[]): string {
  const idx = sources.findIndex((s) => s.id === sourceId);
  return SERIES_COLORS[(idx < 0 ? 0 : idx) % SERIES_COLORS.length];
}

/** Same hue at low opacity, for fills/backgrounds/soft badges. */
export function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
