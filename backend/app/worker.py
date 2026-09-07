import json
import os
import sys
import threading
import time

from psycopg.types.json import Jsonb

from app.changes import has_changed, row_identifier
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
            ack_task(task["id"], task["lock_token"])
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
                result = ("fetch_tasks", new_tasks)
            elif task["payload"]["type"] == "extract":
                row = source.extract(task["payload"])
                result = ("save_tasks", {"source": source_id, "row": row})
            else:
                result = None

            # Only push the result once we've confirmed this worker still
            # holds the claim -- otherwise another worker already reclaimed
            # the task and its own ack/nack (or this push) would duplicate
            # work in flight, not just a row later cleaned up by the upsert.
            if ack_task(task["id"], task["lock_token"]):
                if result is not None:
                    queue_name, payload = result
                    if queue_name == "fetch_tasks":
                        push_tasks(queue_name, payload)
                    else:
                        push_task(queue_name, payload)
            else:
                print(
                    f"task {task['id']} was reclaimed before this worker finished "
                    "-- discarding this worker's result"
                )
        except Exception as e:
            if not nack_task(task["id"], task["lock_token"], str(e)):
                print(
                    f"task {task['id']} was reclaimed before this worker's failure "
                    "-- discarding this worker's nack"
                )


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
                ack_task(task["id"], task["lock_token"])
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
                f"ON CONFLICT ({', '.join(source.conflict_columns)}) DO UPDATE SET {set_clause} "
                f"RETURNING *"
            )

            # Claim the task before writing the result: if lock_token no
            # longer matches, another worker reclaimed it, so this worker's
            # row must be discarded rather than written -- checking the
            # claim only after the insert would let the write through even
            # though the task is no longer this worker's to finish.
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE tasks SET status = 'done' WHERE id = %s AND lock_token = %s",
                        (task["id"], task["lock_token"]),
                    )
                    if cur.rowcount == 0:
                        conn.rollback()
                        print(
                            f"task {task['id']} was reclaimed before this worker finished "
                            "-- discarding this worker's result"
                        )
                        continue
                    cur.execute(sql, row)
                    saved_row = dict(zip((d[0] for d in cur.description), cur.fetchone()))

                    # Stage 14: diff against the most recent history entry for
                    # this row (none yet, for a brand-new row) rather than
                    # writing history unconditionally -- an unchanged row
                    # skips both the history insert and the changes-feed
                    # entry, which is what keeps *_history from growing on
                    # every re-scrape of data that hasn't moved.
                    cur.execute(
                        f"SELECT data FROM {source.history_table} "
                        f"WHERE {source.history_fk_column} = %s ORDER BY recorded_at DESC LIMIT 1",
                        (saved_row["id"],),
                    )
                    previous = cur.fetchone()

                    if previous is None:
                        # First save ever for this row -- nothing to diff
                        # against yet, so this becomes the baseline history
                        # entry with no change event.
                        changed, changed_fields = False, {}
                        write_history = True
                    else:
                        changed, changed_fields = has_changed(source.id, previous[0], saved_row)
                        write_history = changed

                    if write_history:
                        cur.execute(
                            f"INSERT INTO {source.history_table} ({source.history_fk_column}, data) VALUES (%s, %s)",
                            (
                                saved_row["id"],
                                # default=str handles the timestamp columns RETURNING * hands back
                                # (updated_at, fetched_at, ...), which json.dumps can't serialize directly.
                                Jsonb(saved_row, dumps=lambda obj: json.dumps(obj, default=str)),
                            ),
                        )

                    if changed:
                        cur.execute(
                            "INSERT INTO changes (source_id, row_identifier, changed_fields) VALUES (%s, %s, %s)",
                            (
                                source.id,
                                row_identifier(source, saved_row),
                                Jsonb(changed_fields, dumps=lambda obj: json.dumps(obj, default=str)),
                            ),
                        )
                conn.commit()
        except Exception as e:
            if not nack_task(task["id"], task["lock_token"], str(e)):
                print(
                    f"task {task['id']} was reclaimed before this worker's failure "
                    "-- discarding this worker's nack"
                )


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
