export type PaginationStatus = "following" | "single_page" | "possibly_incomplete" | "page_cap_hit" | null;

export type SourceInfo = {
  id: string;
  name: string;
  table_name: string;
  cron_schedule: string;
  max_requests_per_minute: number;
  is_custom: boolean;
  pagination_status: PaginationStatus;
};

export type Row = Record<string, unknown>;

export type TaskSummary = Record<string, Record<string, number>>;

export type RateLimit = {
  source_id: string;
  count: number;
  max_per_minute: number;
};

export type ActivityPoint = { minute: string; count: number };

export type ActivitySeries = Record<string, ActivityPoint[]>;

export type FailedTask = {
  id: number;
  queue_name: string;
  payload: Record<string, unknown>;
  attempts: number;
  last_error: string | null;
};

export type SourceStats = {
  source_id: string;
  row_count: number;
  last_run_at: string | null;
  last_updated_at: string | null;
  failed_count: number;
};
