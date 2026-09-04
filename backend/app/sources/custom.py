import hashlib
import json
import re
import uuid
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from app.db import get_connection
from app.http import fetch

LIST_KEYS = ("results", "data", "items", "records")
# Common id-ish fields to look for on an arbitrary item, in priority order.
ID_KEYS = ("id", "uuid", "_id", "slug", "key")

# Stage 10 pagination detection -- deliberately just these three shapes plus
# "none detected". See detect_pagination()'s docstring before adding a fourth.
NEXT_FIELD_KEYS = ("next", "next_page", "nextPage", "next_url")
CURSOR_FIELD_KEYS = ("cursor", "next_cursor", "after")
TOTAL_COUNT_KEYS = ("count", "total", "total_count")
# 50 pages (the spec's own example) is too tight for PokeAPI's own list at its
# default page size (1351 pokemon / 20 per page = 68 pages) -- bumped to 100
# so that real, well-behaved pagination actually completes; still a hard,
# finite bound against a misdetected or misbehaving "next".
MAX_PAGES = 100


def new_id() -> str:
    return f"custom-{uuid.uuid4().hex[:8]}"


def _item_key(item) -> str:
    """The natural key for a row from a user-supplied API. We don't know its
    shape ahead of time, so we look for a common id-ish field first; if none
    exists, fall back to a content hash so identical re-fetched items still
    collapse to the same key instead of duplicating."""
    if isinstance(item, dict):
        for key in ID_KEYS:
            value = item.get(key)
            if value is not None:
                return str(value)
    return hashlib.sha256(json.dumps(item, sort_keys=True, default=str).encode()).hexdigest()


def _extract_items(payload) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in LIST_KEYS:
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return [payload]


def _set_query_param(url: str, key: str, value) -> str:
    parts = urlparse(url)
    query = dict(parse_qsl(parts.query))
    query[key] = str(value)
    return urlunparse(parts._replace(query=urlencode(query)))


def _parse_link_header(header_value: str):
    """Standard RFC 5988 Link header, e.g.
    '<https://api.example.com/x?page=2>; rel="next"'."""
    for part in header_value.split(","):
        segments = part.split(";")
        url_part = segments[0].strip()
        if not (url_part.startswith("<") and url_part.endswith(">")):
            continue
        if any(re.match(r'\s*rel="?next"?\s*$', seg) for seg in segments[1:]):
            return url_part[1:-1]
    return None


def detect_pagination(payload, headers, request_url: str):
    """Looks for a next-page mechanism in three common shapes, checked in
    this order, stopping at the first match. Returns the URL to fetch next,
    or None if the response doesn't describe one -- which is the normal,
    expected result for a genuinely single-page API, not an error.

    1. Body field (next/next_page/nextPage/next_url): a full URL is used
       directly; a bare page number is applied to the ?page= query param of
       the current request URL (the overwhelmingly common convention).
    2. Cursor style (cursor/next_cursor/after): the token is applied to a
       query param of the same name as the field it was found under.
    3. Link header with rel="next" (RFC 5988 -- GitHub's API, among others).

    Deliberately doesn't try to handle anything beyond these three shapes --
    see Stage 10 notes. A fifth real-world shape found in testing should be
    flagged, not quietly added here.
    """
    if isinstance(payload, dict):
        for key in NEXT_FIELD_KEYS:
            value = payload.get(key)
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                return value
            if isinstance(value, int) and not isinstance(value, bool):
                return _set_query_param(request_url, "page", value)

        for key in CURSOR_FIELD_KEYS:
            value = payload.get(key)
            if isinstance(value, str) and value:
                return _set_query_param(request_url, key, value)

    link_header = headers.get("link")
    if link_header:
        next_url = _parse_link_header(link_header)
        if next_url:
            return next_url

    return None


def _has_total_count_metadata(payload) -> bool:
    return isinstance(payload, dict) and any(payload.get(k) is not None for k in TOTAL_COUNT_KEYS)


def _set_pagination_status(source_id: str, status: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE custom_sources SET pagination_status = %s WHERE id = %s",
                (status, source_id),
            )
        conn.commit()


def discover(url: str, source_id: str) -> list[dict]:
    """Discovery for a user-supplied API: fetch a page, find the array of
    records (top-level list, or the first common wrapper key), hand each one
    to extract() as-is, then follow pagination (see detect_pagination) up to
    MAX_PAGES. Records what happened as source.pagination_status so it's
    visible on the source's page rather than only in logs:

    - "following": pagination was detected and followed across pages
    - "single_page": no pagination mechanism found, and nothing suggests
      there should be one
    - "possibly_incomplete": no pagination mechanism found, but page 1 has
      total-count-style metadata (count/total/total_count) suggesting more
      rows exist that we have no way to reach
    - "page_cap_hit": still finding next-page links at MAX_PAGES; stopped to
      avoid looping forever against a misdetected or misbehaving API
    """
    tasks: list[dict] = []
    page_url = url
    pages_fetched = 0
    first_payload = None
    ever_paginated = False

    while page_url and pages_fetched < MAX_PAGES:
        response = fetch(page_url)
        payload = response.json()
        if first_payload is None:
            first_payload = payload
        tasks.extend({"type": "extract", "item": item} for item in _extract_items(payload))
        pages_fetched += 1

        next_url = detect_pagination(payload, response.headers, page_url)
        ever_paginated = ever_paginated or next_url is not None
        page_url = next_url

    if page_url:
        status = "page_cap_hit"
        print(f"[custom:{source_id}] pagination cap of {MAX_PAGES} pages hit; more pages likely remain")
    elif ever_paginated:
        status = "following"
    elif _has_total_count_metadata(first_payload):
        status = "possibly_incomplete"
    else:
        status = "single_page"

    _set_pagination_status(source_id, status)
    return tasks


def extract(task: dict) -> dict:
    # Kept as a plain dict (not wrapped in Jsonb here) because this travels
    # through push_task(), which Jsonb-wraps the *whole* payload -- nesting
    # a second Jsonb inside that breaks its json.dumps. The save worker
    # wraps "data" in Jsonb itself, right before the INSERT.
    return {"source_id": task["source"], "item_key": _item_key(task["item"]), "data": task["item"]}
