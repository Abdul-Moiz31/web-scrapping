import { TaskSummary } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export function TaskQueuePanel({ summary }: { summary: TaskSummary }) {
  const queueNames = Object.keys(summary).sort();

  if (queueNames.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-400">
        No task activity yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {queueNames.map((queueName) => (
        <div key={queueName} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-gray-800">{queueName}</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary[queueName]).map(([status, count]) => (
              <span
                key={status}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"}`}
              >
                {status}: {count}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
