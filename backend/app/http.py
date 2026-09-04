from urllib.parse import urlparse

import httpx

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
)

# Used only as a fallback if the first request looks blocked.
RETRY_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15"
)

BLOCK_STATUS_CODES = {403, 429}
BLOCK_BODY_MARKERS = ("captcha", "access denied", "unusual traffic")


class BlockedError(Exception):
    """Raised when a target site still looks blocked after a retry."""


def looks_blocked(response: httpx.Response) -> bool:
    if response.status_code in BLOCK_STATUS_CODES:
        return True
    body = response.text.lower()
    return any(marker in body for marker in BLOCK_BODY_MARKERS)


def _get(url: str, user_agent: str) -> httpx.Response:
    parsed = urlparse(url)
    headers = {
        "User-Agent": user_agent,
        "Referer": f"{parsed.scheme}://{parsed.netloc}/",
        "Accept-Language": "en-US,en;q=0.9",
    }
    with httpx.Client(timeout=30) as client:
        return client.get(url, headers=headers)


def fetch(url: str) -> httpx.Response:
    """The only way any code in this repo talks to a target site. Sends a
    real browser User-Agent and a Referer matching the target's own origin.
    If the response looks blocked, retries once with a different User-Agent
    before giving up."""
    response = _get(url, USER_AGENT)
    if looks_blocked(response):
        response = _get(url, RETRY_USER_AGENT)
        if looks_blocked(response):
            raise BlockedError(f"blocked: {response.status_code} after UA retry")
    response.raise_for_status()
    return response
