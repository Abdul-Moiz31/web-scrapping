import { RateLimit } from "@/lib/types";

export function RateLimitBadge({ rateLimit }: { rateLimit: RateLimit | undefined }) {
  if (!rateLimit) return null;

  const ratio = rateLimit.count / rateLimit.max_per_minute;
  const color =
    ratio >= 1
      ? "bg-red-100 text-red-700"
      : ratio >= 0.7
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {rateLimit.count}/{rateLimit.max_per_minute} this minute
    </span>
  );
}
