"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ArrowLeftIcon, LinkIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { useSources } from "@/lib/SourcesContext";

const PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
];

export default function NewCustomSourcePage() {
  const router = useRouter();
  const { refresh } = useSources();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cron, setCron] = useState("*/10 * * * *");
  const [maxRpm, setMaxRpm] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.addCustomSource({
        name: name.trim(),
        url: url.trim(),
        cron_schedule: cron,
        max_requests_per_minute: maxRpm,
      });
      await refresh();
      router.push(`/sources/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add source");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to overview
      </Link>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Add a custom API source</h2>
        <p className="mt-1 text-sm text-gray-400">
          Point it at any public JSON endpoint — a bare array, or an object with a{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">results</code>/
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">data</code>/
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">items</code> array. It gets
          scraped on its own schedule and shows up in the sidebar like any other collection.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Star Wars Characters"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            API URL
          </label>
          <div className="relative">
            <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              type="url"
              placeholder="https://swapi.dev/api/people/"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Scrape schedule
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="*/10 * * * *"
              className="w-40 rounded-md border border-gray-200 px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setCron(preset.value)}
                className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:border-brand-300 hover:text-brand-600"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Max requests / minute
          </label>
          <input
            value={maxRpm}
            onChange={(e) => setMaxRpm(Number(e.target.value) || 1)}
            type="number"
            min={1}
            max={600}
            className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
        >
          {submitting ? "Adding & starting scrape…" : "Add & start scraping"}
        </button>
      </form>
    </div>
  );
}
