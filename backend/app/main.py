from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from app.db import (
    ensure_changes_migration,
    ensure_custom_source_tables,
    ensure_dedup_migration,
    ensure_history_migration,
    get_connection,
    push_task,
)
from app.scheduler import (
    effective_cron_schedule,
    reschedule,
    scheduler,
    schedule_source,
    start_scheduler,
    unschedule_source,
)
from app.settings import set_cron_override
from app.sources import custom
from app.sources.registry import CUSTOM_TABLE, get_source, list_all_sources


class ScheduleUpdate(BaseModel):
    cron_schedule: str


class CustomSourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=1, max_length=2048)
    cron_schedule: str = "*/10 * * * *"
    max_requests_per_minute: int = 60

    @field_validator("url")
    @classmethod
    def url_must_be_http(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("url must start with http:// or https://")
        return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_custom_source_tables()
    ensure_dedup_migration()
    ensure_history_migration()
    ensure_changes_migration()
    start_scheduler()
    yield
    scheduler.shutdown()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_source_or_404(source_id: str):
    source = get_source(source_id)
    if source is None:
        raise HTTPException(status_code=404, detail=f"Unknown source {source_id!r}")
    return source


@app.get("/sources")
def list_sources():
    return [
        {
            "id": source.id,
            "name": source.name,
            "table_name": source.table_name,
            "cron_schedule": effective_cron_schedule(source.id),
            "max_requests_per_minute": source.max_requests_per_minute,
            "is_custom": source.is_custom,
            "pagination_status": source.pagination_status,
        }
        for source in list_all_sources()
    ]


@app.post("/custom-sources")
def create_custom_source(body: CustomSourceCreate):
    source_id = custom.new_id()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO custom_sources (id, name, url, cron_schedule, max_requests_per_minute)
                VALUES (%(id)s, %(name)s, %(url)s, %(cron_schedule)s, %(max_requests_per_minute)s)
                """,
                {
                    "id": source_id,
                    "name": body.name,
                    "url": body.url,
                    "cron_schedule": body.cron_schedule,
                    "max_requests_per_minute": body.max_requests_per_minute,
                },
            )
        conn.commit()

    schedule_source(source_id)
    push_task("fetch_tasks", {"source": source_id, "type": "discover"})
    return {"id": source_id, "name": body.name, "url": body.url}


@app.delete("/custom-sources/{source_id}")
def delete_custom_source(source_id: str):
    source = _get_source_or_404(source_id)
    if not source.is_custom:
        raise HTTPException(status_code=400, detail="Only custom sources can be deleted")

    unschedule_source(source_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tasks WHERE payload->>'source' = %s", (source_id,))
            cur.execute("DELETE FROM custom_sources WHERE id = %s", (source_id,))
        conn.commit()
    return {"source_id": source_id, "deleted": True}


@app.post("/sources/{source_id}/trigger")
def trigger_source(source_id: str):
    _get_source_or_404(source_id)
    push_task("fetch_tasks", {"source": source_id, "type": "discover"})
    return {"status": "queued"}


@app.post("/sources/{source_id}/stop")
def stop_source(source_id: str):
    """Cancels this source's queued (pending) work in both queues. A task
    already 'processing' finishes naturally -- there's no clean way to
    interrupt a request already in flight without process signaling."""
    _get_source_or_404(source_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM tasks WHERE status = 'pending' AND payload->>'source' = %s",
                (source_id,),
            )
            cancelled = cur.rowcount
        conn.commit()
    return {"source_id": source_id, "cancelled": cancelled}


@app.put("/sources/{source_id}/schedule")
def update_source_schedule(source_id: str, body: ScheduleUpdate):
    _get_source_or_404(source_id)
    try:
        reschedule(source_id, body.cron_schedule)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cron expression")
    set_cron_override(source_id, body.cron_schedule)
    return {"source_id": source_id, "cron_schedule": body.cron_schedule}


@app.get("/sources/{source_id}/rows")
def source_rows(source_id: str):
    source = _get_source_or_404(source_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            if source.table_name == CUSTOM_TABLE:
                cur.execute(
                    "SELECT id, item_key, data, updated_at FROM custom_source_rows "
                    "WHERE source_id = %s ORDER BY id",
                    (source_id,),
                )
                rows = cur.fetchall()
                # Unlike the typed sources below, a custom row's shape is
                # unknown JSON -- kept nested under "data" (rather than
                # flattened into the row) so the generic renderer can walk
                # it without colliding with whatever field names it contains.
                return [
                    {
                        "id": row_id,
                        "item_key": item_key,
                        "data": data,
                        "updated_at": updated_at.isoformat() if updated_at else None,
                    }
                    for row_id, item_key, data, updated_at in rows
                ]

            cur.execute(f"SELECT * FROM {source.table_name} ORDER BY id")
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row)) for row in rows]


def _count_rows(cur, source) -> int:
    if source.table_name == CUSTOM_TABLE:
        cur.execute("SELECT COUNT(*) FROM custom_source_rows WHERE source_id = %s", (source.id,))
    else:
        cur.execute(f"SELECT COUNT(*) FROM {source.table_name}")
    return cur.fetchone()[0]


def _last_updated(cur, source):
    if source.table_name == CUSTOM_TABLE:
        cur.execute("SELECT MAX(updated_at) FROM custom_source_rows WHERE source_id = %s", (source.id,))
    else:
        cur.execute(f"SELECT MAX(updated_at) FROM {source.table_name}")
    return cur.fetchone()[0]


@app.get("/sources/{source_id}/count")
def source_row_count(source_id: str):
    source = _get_source_or_404(source_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            count = _count_rows(cur, source)
    return {"source_id": source_id, "count": count}


@app.get("/sources/{source_id}/stats")
def source_stats(source_id: str):
    source = _get_source_or_404(source_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            row_count = _count_rows(cur, source)
            last_updated_at = _last_updated(cur, source)

            # "Last successful trigger" is derived from the discover task's
            # own timestamps rather than a new column: locked_at is set when
            # the task starts running and (for a 'discover' task) is never
            # touched again once it lands on status='done'.
            cur.execute(
                """
                SELECT MAX(locked_at) FROM tasks
                WHERE payload->>'source' = %(source_id)s
                  AND payload->>'type' = 'discover'
                  AND status = 'done'
                """,
                {"source_id": source_id},
            )
            last_run_at = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(*) FROM tasks WHERE payload->>'source' = %(source_id)s AND status = 'failed'",
                {"source_id": source_id},
            )
            failed_count = cur.fetchone()[0]

    return {
        "source_id": source_id,
        "row_count": row_count,
        "last_run_at": last_run_at.isoformat() if last_run_at else None,
        "last_updated_at": last_updated_at.isoformat() if last_updated_at else None,
        "failed_count": failed_count,
    }


@app.get("/sources/{source_id}/last-updated")
def source_last_updated(source_id: str):
    """Cheap poll target: just the MAX(updated_at) aggregate, no row fetch.
    The frontend hits this every few seconds per open source page and only
    pulls the full row list when this value actually moves."""
    source = _get_source_or_404(source_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            last_updated = _last_updated(cur, source)
    return {"last_updated": last_updated.isoformat() if last_updated else None}


@app.get("/sources/{source_id}/rate-limit")
def source_rate_limit(source_id: str):
    source = _get_source_or_404(source_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT count FROM rate_limit_counters
                WHERE source_id = %(source_id)s AND minute_bucket = date_trunc('minute', NOW())
                """,
                {"source_id": source_id},
            )
            row = cur.fetchone()
    return {
        "source_id": source_id,
        "count": row[0] if row else 0,
        "max_per_minute": source.max_requests_per_minute,
    }


@app.get("/tasks/summary")
def tasks_summary():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT queue_name, status, COUNT(*) FROM tasks GROUP BY queue_name, status")
            rows = cur.fetchall()

    summary: dict = {}
    for queue_name, status, count in rows:
        summary.setdefault(queue_name, {})[status] = count
    return summary


@app.get("/tasks/failed")
def failed_tasks():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, queue_name, payload, attempts, last_error
                FROM tasks WHERE status = 'failed'
                ORDER BY id DESC
                """
            )
            rows = cur.fetchall()
    return [
        {"id": r[0], "queue_name": r[1], "payload": r[2], "attempts": r[3], "last_error": r[4]}
        for r in rows
    ]


@app.get("/activity")
def request_activity(minutes: int = 30):
    """Per-minute request counts for every source over the last `minutes`
    minutes, gap-filled with zeros so the frontend can chart it directly
    without doing its own bucket math."""
    minutes = max(1, min(minutes, 180))
    source_ids = [source.id for source in list_all_sources()]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT gs.minute_bucket, s.source_id, COALESCE(c.count, 0) AS count
                FROM generate_series(
                    date_trunc('minute', NOW()) - (%(minutes)s || ' minutes')::interval,
                    date_trunc('minute', NOW()),
                    interval '1 minute'
                ) AS gs(minute_bucket)
                CROSS JOIN unnest(%(source_ids)s::text[]) AS s(source_id)
                LEFT JOIN rate_limit_counters c
                    ON c.source_id = s.source_id AND c.minute_bucket = gs.minute_bucket
                ORDER BY gs.minute_bucket
                """,
                {"minutes": minutes, "source_ids": source_ids},
            )
            rows = cur.fetchall()

    series: dict[str, list[dict]] = {source_id: [] for source_id in source_ids}
    for minute_bucket, source_id, count in rows:
        series[source_id].append({"minute": minute_bucket.isoformat(), "count": count})
    return series
