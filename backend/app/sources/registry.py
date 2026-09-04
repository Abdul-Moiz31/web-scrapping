from dataclasses import dataclass
from typing import Callable, Optional

from app.db import get_connection
from app.sources import coingecko, custom, pokemon, rickandmorty

CUSTOM_TABLE = "custom_source_rows"


@dataclass(frozen=True)
class Source:
    id: str
    name: str
    table_name: str
    cron_schedule: str
    max_requests_per_minute: int
    discover: Callable[[], list[dict]]
    extract: Callable[[dict], dict]
    # Natural-key column(s) for this source's table -- the ON CONFLICT target
    # that makes re-scraping an upsert instead of a duplicate insert.
    conflict_columns: tuple[str, ...]
    is_custom: bool = False
    # Custom sources only (Stage 10) -- what the last discover run found
    # about this API's pagination. None for typed sources and for a custom
    # source that hasn't completed a discover run yet.
    pagination_status: Optional[str] = None


SOURCES: dict[str, Source] = {
    "pokemon": Source(
        id="pokemon",
        name="Pokemon",
        table_name="pokemon",
        cron_schedule="*/3 * * * *",
        max_requests_per_minute=60,
        discover=pokemon.discover,
        extract=pokemon.extract,
        conflict_columns=("name",),
    ),
    "rickandmorty": Source(
        id="rickandmorty",
        name="Rick and Morty",
        table_name="rick_and_morty",
        cron_schedule="*/4 * * * *",
        max_requests_per_minute=30,
        discover=rickandmorty.discover,
        extract=rickandmorty.extract,
        conflict_columns=("external_id",),
    ),
    "coingecko": Source(
        id="coingecko",
        name="CoinGecko Markets",
        table_name="coins",
        cron_schedule="*/5 * * * *",
        max_requests_per_minute=30,
        discover=coingecko.discover,
        extract=coingecko.extract,
        conflict_columns=("coin_id",),
    ),
}


def _row_to_custom_source(row: tuple) -> Source:
    source_id, name, url, cron_schedule, max_rpm, pagination_status = row
    return Source(
        id=source_id,
        name=name,
        table_name=CUSTOM_TABLE,
        cron_schedule=cron_schedule,
        max_requests_per_minute=max_rpm,
        discover=lambda captured_url=url, captured_id=source_id: custom.discover(captured_url, captured_id),
        extract=custom.extract,
        conflict_columns=("source_id", "item_key"),
        is_custom=True,
        pagination_status=pagination_status,
    )


def list_custom_sources() -> list[Source]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, url, cron_schedule, max_requests_per_minute, pagination_status "
                "FROM custom_sources ORDER BY created_at"
            )
            rows = cur.fetchall()
    return [_row_to_custom_source(row) for row in rows]


def get_custom_source(source_id: str) -> Optional[Source]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, url, cron_schedule, max_requests_per_minute, pagination_status "
                "FROM custom_sources WHERE id = %s",
                (source_id,),
            )
            row = cur.fetchone()
    return _row_to_custom_source(row) if row else None


def get_source(source_id: str) -> Optional[Source]:
    if source_id in SOURCES:
        return SOURCES[source_id]
    return get_custom_source(source_id)


def list_all_sources() -> list[Source]:
    return [*SOURCES.values(), *list_custom_sources()]
