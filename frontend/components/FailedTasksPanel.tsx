"use client";

import { useState } from "react";

import { FailedTask } from "@/lib/types";

export function FailedTasksPanel({ tasks }: { tasks: FailedTask[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (tasks.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-gray-800">Failed tasks ({tasks.length})</div>
      <ul className="divide-y divide-gray-100">
        {tasks.map((task) => (
          <li key={task.id} className="py-2">
            <button
              className="w-full text-left text-sm text-gray-700 hover:text-gray-900"
              onClick={() => setOpenId(openId === task.id ? null : task.id)}
            >
              #{task.id} · {task.queue_name} · {task.attempts} attempt{task.attempts === 1 ? "" : "s"}
            </button>
            {openId === task.id && (
              <div className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                {task.last_error || "No error message recorded."}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
