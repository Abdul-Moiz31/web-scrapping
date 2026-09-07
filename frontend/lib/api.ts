import { ActivitySeries, FailedTask, HistoryEntry, RateLimit, Row, SourceInfo, SourceStats, TaskSummary } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function postJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `PUT ${path} failed: ${res.status}`);
  }
  return res.json();
}

async function postJSONBody<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `DELETE ${path} failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  listSources: () => getJSON<SourceInfo[]>("/sources"),
  sourceRows: (id: string) => getJSON<Row[]>(`/sources/${id}/rows`),
  rowHistory: (id: string, rowId: number) =>
    getJSON<HistoryEntry[]>(`/sources/${id}/rows/${rowId}/history`),
  sourceCount: (id: string) => getJSON<{ source_id: string; count: number }>(`/sources/${id}/count`),
  sourceStats: (id: string) => getJSON<SourceStats>(`/sources/${id}/stats`),
  lastUpdated: (id: string) => getJSON<{ last_updated: string | null }>(`/sources/${id}/last-updated`),
  rateLimit: (id: string) => getJSON<RateLimit>(`/sources/${id}/rate-limit`),
  triggerSource: (id: string) => postJSON<{ status: string }>(`/sources/${id}/trigger`),
  stopSource: (id: string) => postJSON<{ source_id: string; cancelled: number }>(`/sources/${id}/stop`),
  taskSummary: () => getJSON<TaskSummary>("/tasks/summary"),
  failedTasks: () => getJSON<FailedTask[]>("/tasks/failed"),
  activity: (minutes = 30) => getJSON<ActivitySeries>(`/activity?minutes=${minutes}`),
  updateSchedule: (id: string, cron_schedule: string) =>
    putJSON<{ source_id: string; cron_schedule: string }>(`/sources/${id}/schedule`, {
      cron_schedule,
    }),
  addCustomSource: (body: {
    name: string;
    url: string;
    cron_schedule?: string;
    max_requests_per_minute?: number;
  }) => postJSONBody<{ id: string; name: string; url: string }>("/custom-sources", body),
  deleteCustomSource: (id: string) => del<{ source_id: string; deleted: boolean }>(`/custom-sources/${id}`),
};
