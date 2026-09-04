"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import { useSources } from "@/lib/SourcesContext";
import { SourceInfo } from "@/lib/types";

const PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
];

function ScheduleRow({ source, onSaved }: { source: SourceInfo; onSaved: () => void }) {
  const [value, setValue] = useState(source.cron_schedule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateSchedule(source.id, value);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const dirty = value !== source.cron_schedule;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{source.name}</h3>
        <p className="text-xs text-gray-400">
          Runs a full discover-and-extract on this cron schedule. Also capped at{" "}
          {source.max_requests_per_minute} requests/min to the source.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="* * * * *"
          className="w-48 rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved ? <span className="text-sm text-emerald-600">Saved — applied immediately</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => setValue(preset.value)}
            className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:border-brand-300 hover:text-brand-600"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { sources, refresh } = useSources();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-400">
          Edit each source&apos;s cron schedule. Changes take effect immediately — no restart
          needed.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {sources.map((source) => (
          <ScheduleRow key={source.id} source={source} onSaved={refresh} />
        ))}
      </div>
    </div>
  );
}
