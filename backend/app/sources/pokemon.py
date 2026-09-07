from app.db import get_connection
from app.http import fetch
from app.sources.diffing import field_diff

LIST_URL = "https://pokeapi.co/api/v2/pokemon?limit=20"


def _known_names() -> set[str]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM pokemon")
            return {row[0] for row in cur.fetchall()}


def discover() -> list[dict]:
    """Walk every page of the list endpoint -- cheap, since the list only
    has name+url and pagination is the only way to see what currently
    exists. But a pokemon's own detail data (height/weight/etc.) never
    changes once fetched, so re-hitting all ~1300 detail pages every run for
    data we already have is pure waste. Skip extract tasks for names already
    in the table; only new entries pay the detail-fetch cost."""
    known = _known_names()
    tasks = []
    url = LIST_URL
    while url:
        data = fetch(url).json()
        for entry in data["results"]:
            if entry["name"] not in known:
                tasks.append({"type": "extract", "url": entry["url"]})
        url = data["next"]
    return tasks


def extract(task: dict) -> dict:
    detail = fetch(task["url"]).json()
    return {
        "name": detail["name"],
        "height": detail["height"],
        "weight": detail["weight"],
        "base_experience": detail["base_experience"],
        "sprite_url": detail["sprites"]["front_default"],
    }


def detect_changes(old_data: dict, new_data: dict) -> dict:
    """No field is special-cased -- a Pokemon's stats are static, so any
    difference at all (were the API to ever change one) is worth flagging."""
    return field_diff(old_data, new_data)
