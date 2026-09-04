"use client";

import { useState } from "react";

import { api } from "@/lib/api";

export function StopButton({ sourceId, onStopped }: { sourceId: string; onStopped?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await api.stopSource(sourceId);
      setMessage(`Cancelled ${result.cancelled} queued task${result.cancelled === 1 ? "" : "s"}`);
      onStopped?.();
      setTimeout(() => setMessage(null), 4000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Stopping…" : "Stop"}
      </button>
      {message ? <span className="text-xs text-gray-500">{message}</span> : null}
    </div>
  );
}
