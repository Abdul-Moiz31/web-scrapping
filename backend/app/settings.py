from typing import Optional

from app.db import get_connection


def get_cron_override(source_id: str) -> Optional[str]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT cron_schedule FROM source_settings WHERE source_id = %s",
                (source_id,),
            )
            row = cur.fetchone()
    return row[0] if row else None


def set_cron_override(source_id: str, cron_schedule: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO source_settings (source_id, cron_schedule)
                VALUES (%s, %s)
                ON CONFLICT (source_id) DO UPDATE SET cron_schedule = EXCLUDED.cron_schedule
                """,
                (source_id, cron_schedule),
            )
        conn.commit()
