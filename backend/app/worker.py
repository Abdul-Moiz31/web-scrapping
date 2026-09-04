import os
import sys
import threading
import time

from psycopg.types.json import Jsonb

from app.db import get_connection, push_task, push_tasks
from app.queue import ack_task, nack_task, pop_task, reschedule_task
from app.rate_limit import is_allowed
from app.sources.registry import CUSTOM_TABLE, get_source

POLL_INTERVAL_SECONDS = 1
RATE_LIMIT_RETRY_DELAY_SECONDS = 5
RATE_LIMIT_DENIED_SLEEP_SECONDS = 1

# How many of this container's loop workers run at once. Each is a plain
# thread, not a process: every task is I/O (an HTTP fetch or a DB round
# trip), so the GIL is released for the part that actually takes time and
# threads genuinely overlap. Safe to raise because the only shared state is
# in Postgres, and both the task queue (queue.py's SELECT ... FOR UPDATE
# SKIP LOCKED) and the rate limiter (rate_limit.py's INSERT ... ON CONFLICT)
# are already built to serialize concurrent access correctly.
WORKER_CONCURRENCY = int(os.environ.get("WORKER_CONCURRENCY", "4"))


def fetch_worker_loop() -> None:
    while True:
        task = pop_task("fetch_tasks")
        if task is None:
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        source_id = task["payload"]["source"]
        source = get_source(source_id)
        if source is None:
            # Source was deleted (e.g. a custom source removed) while its
            # tasks were still queued -- drop them rather than crash-looping.
            ack_task(task["id"])
            continue

        if not is_allowed(source_id, source.max_requests_per_minute):
            reschedule_task(task["id"], RATE_LIMIT_RETRY_DELAY_SECONDS)
            # Avoid hot-looping through an entire rate-limited backlog: without
            # this, a big pending queue gets denied hundreds of times a second,
            # inflating the counter far past max_per_minute for no benefit.
            time.sleep(RATE_LIMIT_DENIED_SLEEP_SECONDS)
            continue

        try:
            if task["payload"]["type"] == "discover":
                new_tasks = source.discover()
                for new_task in new_tasks:
                    new_task["source"] = source_id
                push_tasks("fetch_tasks", new_tasks)
            elif task["payload"]["type"] == "extract":
                row = source.extract(task["payload"])
                push_task("save_tasks", {"source": source_id, "row": row})
            ack_task(task["id"])
        except Exception as e:
            nack_task(task["id"], str(e))


def save_worker_loop() -> None:
    while True:
        task = pop_task("save_tasks")
        if task is None:
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        try:
            payload = task["payload"]
            source = get_source(payload["source"])
            if source is None:
                ack_task(task["id"])
                continue
            table_name = source.table_name
            row = payload["row"]
            if table_name == CUSTOM_TABLE:
                row = {**row, "data": Jsonb(row["data"])}

            columns = list(row.keys())
            column_list = ", ".join(columns)
            placeholders = ", ".join(f"%({col})s" for col in columns)
            # Re-scraping the same natural key updates the row in place
            # instead of duplicating it; updated_at marks the refresh, while
            # any first-insert-only column (e.g. fetched_at) is left alone.
            update_cols = [c for c in columns if c not in source.conflict_columns]
            set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
            set_clause = f"{set_clause}, updated_at = NOW()" if set_clause else "updated_at = NOW()"
            sql = (
                f"INSERT INTO {table_name} ({column_list}) VALUES ({placeholders}) "
                f"ON CONFLICT ({', '.join(source.conflict_columns)}) DO UPDATE SET {set_clause}"
            )

            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, row)
                    cur.execute(
                        "UPDATE tasks SET status = 'done' WHERE id = %s", (task["id"],)
                    )
                conn.commit()
        except Exception as e:
            nack_task(task["id"], str(e))


def run_concurrent(loop_fn, concurrency: int) -> None:
    threads = [threading.Thread(target=loop_fn, daemon=True) for _ in range(concurrency)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()


if __name__ == "__main__":
    queue = sys.argv[1]
    if queue == "fetch":
        run_concurrent(fetch_worker_loop, WORKER_CONCURRENCY)
    elif queue == "save":
        run_concurrent(save_worker_loop, WORKER_CONCURRENCY)
    else:
        raise SystemExit(f"Unknown worker queue {queue!r}, expected 'fetch' or 'save'")
