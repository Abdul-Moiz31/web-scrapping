from typing import Optional

from psycopg.rows import dict_row

from app.db import get_connection


def pop_task(queue_name: str) -> Optional[dict]:
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                UPDATE tasks
                SET status = 'processing', locked_at = NOW()
                WHERE id = (
                    SELECT id FROM tasks
                    WHERE queue_name = %(queue_name)s
                      AND (
                        (status = 'pending' AND run_after <= NOW())
                        OR (status = 'processing' AND locked_at < NOW() - INTERVAL '5 minutes')
                      )
                    ORDER BY id
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                RETURNING id, queue_name, payload, status, attempts, last_error, locked_at, run_after, created_at
                """,
                {"queue_name": queue_name},
            )
            task = cur.fetchone()
        conn.commit()
    return task


def ack_task(task_id: int) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE tasks SET status = 'done' WHERE id = %s", (task_id,))
        conn.commit()


def nack_task(task_id: int, error: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET attempts = attempts + 1,
                    last_error = %(error)s,
                    locked_at = NULL,
                    status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
                    run_after = CASE WHEN attempts + 1 >= 5 THEN run_after
                                     ELSE NOW() + (POWER(2, attempts + 1) * INTERVAL '1 second')
                                END
                WHERE id = %(task_id)s
                """,
                {"error": error, "task_id": task_id},
            )
        conn.commit()


def reschedule_task(task_id: int, delay_seconds: int) -> None:
    """Puts a task back to pending after a fixed delay without touching
    attempts/last_error -- for rate-limit deferrals, which aren't failures."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET status = 'pending',
                    locked_at = NULL,
                    run_after = NOW() + (%(delay)s * INTERVAL '1 second')
                WHERE id = %(task_id)s
                """,
                {"delay": delay_seconds, "task_id": task_id},
            )
        conn.commit()
