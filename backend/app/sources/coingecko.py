from app.http import fetch

# REST Countries (the source originally specified for this slot) has been
# fully deprecated -- v3.1 and v5 both now return a 200 with an error body
# and require an API key. This source fills the same role: no pagination,
# one request, full array of rows immediately.
MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=1"


def discover() -> list[dict]:
    """One request returns every row -- same zero-step shape the Countries
    source was meant to demonstrate. Each row's full data is packaged
    directly into its own task; extract() below makes no HTTP request."""
    coins = fetch(MARKETS_URL).json()
    return [{"type": "extract", "coin": coin} for coin in coins]


def extract(task: dict) -> dict:
    coin = task["coin"]
    return {
        "coin_id": coin["id"],
        "symbol": coin["symbol"],
        "name": coin["name"],
        "current_price": coin["current_price"],
        "market_cap": coin["market_cap"],
        "image_url": coin["image"],
    }
