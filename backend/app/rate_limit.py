from app.db import get_connection


def is_allowed(source_id: str, max_per_minute: int) -> bool:
    """Atomically increments this source's counter for the current minute,
    but only if it's still under the cap -- the WHERE clause makes the
    increment itself conditional, so a denied check leaves the counter
    untouched instead of drifting past max_per_minute. That matters once
    several worker threads race on the same saturated source: without the
    WHERE guard, every denied attempt still incremented the row, so the
    counter (and the dashboard reading it) could run well past the cap
    even though the extra work was correctly rejected. The INSERT ... ON
    CONFLICT DO UPDATE stays a single statement, so concurrent workers
    serialize on Postgres's row-level lock instead of racing on a stale
    read."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO rate_limit_counters (source_id, minute_bucket, count)
                VALUES (%(source_id)s, date_trunc('minute', NOW()), 1)
                ON CONFLICT (source_id, minute_bucket)
                DO UPDATE SET count = rate_limit_counters.count + 1
                WHERE rate_limit_counters.count < %(max_per_minute)s
                RETURNING count
                """,
                {"source_id": source_id, "max_per_minute": max_per_minute},
            )
            row = cur.fetchone()
        conn.commit()
    return row is not None
