"use client";

import { useState } from "react";

import { api } from "@/lib/api";

export function TriggerButton({
  sourceId,
  label,
  onTriggered,
}: {
  sourceId: string;
  label?: string;
  onTriggered?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await api.triggerSource(sourceId);
      onTriggered?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
    >
      {loading ? "Queuing…" : (label ?? "Run scrape")}
    </button>
  );
}
