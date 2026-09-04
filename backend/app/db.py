import os

import psycopg
from dotenv import load_dotenv
from psycopg.types.json import Jsonb

load_dotenv()

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/pokemon_scraper"
)


def get_connection():
    return psycopg.connect(DATABASE_URL)


def push_task(queue_name: str, payload: dict) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO tasks (queue_name, payload) VALUES (%s, %s)",
                (queue_name, Jsonb(payload)),
            )
        conn.commit()


def ensure_custom_source_tables() -> None:
    """Postgres's init-script mount only runs against a fresh volume, so an
    already-initialized dev DB never picks up schema.sql changes. Custom
    sources are new enough that we can't assume that -- create their tables
    here too, idempotently, on API startup."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    cron_schedule TEXT NOT NULL DEFAULT '*/10 * * * *',
                    max_requests_per_minute INT NOT NULL DEFAULT 60,
                    created_at TIMESTAMP DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_source_rows (
                    id SERIAL PRIMARY KEY,
                    source_id TEXT NOT NULL REFERENCES custom_sources(id) ON DELETE CASCADE,
                    data JSONB NOT NULL,
                    fetched_at TIMESTAMP DEFAULT NOW()
                )
                """
            )
            # Stage 10: set by discover() after each run -- "following",
            # "single_page", "possibly_incomplete", or "page_cap_hit". NULL
            # until the source's first discover completes.
            cur.execute("ALTER TABLE custom_sources ADD COLUMN IF NOT EXISTS pagination_status TEXT")
        conn.commit()


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
        (table, column),
    )
    return cur.fetchone() is not None


def ensure_dedup_migration() -> None:
    """Stage 8: source tables move from plain INSERT to upsert-on-natural-key
    (name / external_id / coin_id / item_key). Same story as
    ensure_custom_source_tables() above -- an already-initialized dev DB
    won't pick up the new schema.sql, so we retrofit it here, idempotently,
    on every startup.

    Existing rows from before this stage have no natural key to dedupe
    against (rick_and_morty/coins never stored the source's own id, and
    custom_source_rows never stored an item key) -- there's no data worth
    preserving here (it's a learning project, not production), so the first
    time this runs we truncate the scraped-data tables rather than fake a
    backfill. The scheduler repopulates them within minutes. custom_sources
    (the source *definitions*, not their scraped rows) is untouched.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            first_run = not _column_exists(cur, "rick_and_morty", "external_id")
            if first_run:
                cur.execute("TRUNCATE pokemon, rick_and_morty, coins, custom_source_rows")

            cur.execute("ALTER TABLE pokemon ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS pokemon_name_key ON pokemon (name)")

            cur.execute("ALTER TABLE rick_and_morty ADD COLUMN IF NOT EXISTS external_id INTEGER")
            cur.execute("ALTER TABLE rick_and_morty ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()")
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS rick_and_morty_external_id_key ON rick_and_morty (external_id)"
            )

            cur.execute("ALTER TABLE coins ADD COLUMN IF NOT EXISTS coin_id TEXT")
            cur.execute("ALTER TABLE coins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS coins_coin_id_key ON coins (coin_id)")

            cur.execute("ALTER TABLE custom_source_rows ADD COLUMN IF NOT EXISTS item_key TEXT")
            cur.execute("ALTER TABLE custom_source_rows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()")
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS custom_source_rows_source_item_key "
                "ON custom_source_rows (source_id, item_key)"
            )
        conn.commit()


def push_tasks(queue_name: str, payloads: list[dict]) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO tasks (queue_name, payload) VALUES (%s, %s)",
                [(queue_name, Jsonb(payload)) for payload in payloads],
            )
        conn.commit()
