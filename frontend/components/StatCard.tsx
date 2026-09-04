import { ReactNode } from "react";

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{value}</p>
          {sublabel ? <p className="mt-1 text-xs text-gray-400">{sublabel}</p> : null}
        </div>
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
