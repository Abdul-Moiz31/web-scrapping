from app.http import fetch
from app.sources.diffing import field_diff

LIST_URL = "https://pokeapi.co/api/v2/pokemon?limit=20"


def discover() -> list[dict]:
    """Walk every page of the list endpoint. The list only has name+url, so
    each task just carries the detail URL for extract() to fetch."""
    tasks = []
    url = LIST_URL
    while url:
        data = fetch(url).json()
        for entry in data["results"]:
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
