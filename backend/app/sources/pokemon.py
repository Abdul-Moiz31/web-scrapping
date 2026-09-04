from app.http import fetch

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
