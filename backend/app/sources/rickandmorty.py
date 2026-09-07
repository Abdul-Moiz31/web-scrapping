from app.http import fetch
from app.sources.diffing import field_diff

LIST_URL = "https://rickandmortyapi.com/api/character"


def discover() -> list[dict]:
    """The list endpoint already returns full character data, so each task
    carries the raw character record directly. Unlike Pokemon, extract()
    below makes no HTTP request -- it only reshapes what's already here."""
    tasks = []
    url = LIST_URL
    while url:
        data = fetch(url).json()
        for character in data["results"]:
            tasks.append({"type": "extract", "character": character})
        url = data["info"]["next"]
    return tasks


def extract(task: dict) -> dict:
    character = task["character"]
    return {
        "external_id": character["id"],
        "name": character["name"],
        "status": character["status"],
        "species": character["species"],
        "image_url": character["image"],
    }


def detect_changes(old_data: dict, new_data: dict) -> dict:
    """No field specified -- status/species are the fields likely to move
    for a given character, but nothing rules out others, so any difference
    counts (see field_diff's default)."""
    return field_diff(old_data, new_data)
