import uuid
from typing import Optional

from psycopg.rows import dict_row

from app.db import get_connection


def pop_task(queue_name: str) -> Optional[dict]:
    lock_token = uuid.uuid4()
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                UPDATE tasks
                SET status = 'processing', locked_at = NOW(), lock_token = %(lock_token)s
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
                RETURNING id, queue_name, payload, status, attempts, last_error, locked_at, run_after, created_at, lock_token
                """,
                {"queue_name": queue_name, "lock_token": lock_token},
            )
            task = cur.fetchone()
        conn.commit()
    return task


def ack_task(task_id: int, lock_token: uuid.UUID) -> bool:
    """Marks a task done. Returns False (without effect) if lock_token no
    longer matches -- meaning the task was reclaimed by another worker after
    a premature timeout, so this worker's result must not be trusted."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE tasks SET status = 'done' WHERE id = %s AND lock_token = %s",
                (task_id, lock_token),
            )
            matched = cur.rowcount > 0
        conn.commit()
    return matched


def nack_task(task_id: int, lock_token: uuid.UUID, error: str) -> bool:
    """Records a failed attempt. Returns False (without effect) if lock_token
    no longer matches -- see ack_task."""
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
                WHERE id = %(task_id)s AND lock_token = %(lock_token)s
                """,
                {"error": error, "task_id": task_id, "lock_token": lock_token},
            )
            matched = cur.rowcount > 0
        conn.commit()
    return matched


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
