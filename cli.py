#!/usr/bin/env python3
"""Operator CLI -- a thin wrapper around the dashboard's own API. Every
command below calls an endpoint that already exists; this file adds no
scraping/queue/change-detection logic of its own."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API_URL = os.environ.get("API_URL", "http://localhost:8000")


def _request(method: str, path: str, params: dict | None = None, body: dict | None = None):
    url = f"{API_URL}{path}"
    if params:
        query = {k: v for k, v in params.items() if v is not None}
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        print(f"error: {method} {path} -> {e.code}: {detail}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"error: could not reach {API_URL} ({e.reason})", file=sys.stderr)
        sys.exit(1)


def _get(path: str, params: dict | None = None):
    return _request("GET", path, params=params)


def _post(path: str, body: dict | None = None):
    return _request("POST", path, body=body or {})


def _put(path: str, body: dict):
    return _request("PUT", path, body=body)


def _print_table(headers: list[str], rows: list[list[str]]) -> None:
    if not rows:
        print("(none)")
        return
    widths = [max(len(str(h)), *(len(str(r[i])) for r in rows)) for i, h in enumerate(headers)]
    def fmt(cells):
        return "  ".join(str(c).ljust(w) for c, w in zip(cells, widths))
    print(fmt(headers))
    print(fmt(["-" * w for w in widths]))
    for row in rows:
        print(fmt(row))


def sources_list(_args) -> None:
    sources = _get("/sources")
    _print_table(
        ["ID", "NAME", "CRON SCHEDULE", "MAX REQ/MIN"],
        [[s["id"], s["name"], s["cron_schedule"], s["max_requests_per_minute"]] for s in sources],
    )


def source_trigger(args) -> None:
    resp = _post(f"/sources/{args.id}/trigger")
    print(f"{args.id}: {resp['status']}")


def source_config(args) -> None:
    sources = _get("/sources")
    source = next((s for s in sources if s["id"] == args.id), None)
    if source is None:
        print(f"error: unknown source {args.id!r}", file=sys.stderr)
        sys.exit(1)
    for key, value in source.items():
        print(f"{key}: {value}")


def source_set_schedule(args) -> None:
    resp = _put(f"/sources/{args.id}/schedule", {"cron_schedule": args.cron})
    print(f"{resp['source_id']}: cron_schedule set to {resp['cron_schedule']}")


def source_stats(args) -> None:
    resp = _get(f"/sources/{args.id}/stats")
    print(f"source_id: {resp['source_id']}")
    print(f"row_count: {resp['row_count']}")
    print(f"last_run_at: {resp['last_run_at']}")
    print(f"last_updated_at: {resp['last_updated_at']}")
    print(f"failed_count: {resp['failed_count']}")


def queue_status(_args) -> None:
    summary = _get("/tasks/summary")
    rows = [
        [queue_name, status, count]
        for queue_name, by_status in summary.items()
        for status, count in by_status.items()
    ]
    _print_table(["QUEUE", "STATUS", "COUNT"], rows)


def changes(args) -> None:
    entries = _get("/changes", params={"source_id": args.source})
    _print_table(
        ["ID", "SOURCE", "ROW", "DETECTED AT", "CHANGED FIELDS"],
        [
            [e["id"], e["source_id"], e["row_identifier"], e["detected_at"], json.dumps(e["changed_fields"])]
            for e in entries
        ],
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cli.py", description="Operator CLI for the scraper dashboard API")
    sub = parser.add_subparsers(dest="group", required=True)

    sources = sub.add_parser("sources", help="operate on all sources")
    sources_sub = sources.add_subparsers(dest="action", required=True)
    sources_sub.add_parser("list", help="list all sources").set_defaults(func=sources_list)

    source = sub.add_parser("source", help="operate on a single source")
    source_sub = source.add_subparsers(dest="action", required=True)

    p = source_sub.add_parser("trigger", help="trigger a discover run")
    p.add_argument("id")
    p.set_defaults(func=source_trigger)

    p = source_sub.add_parser("config", help="show current settings")
    p.add_argument("id")
    p.set_defaults(func=source_config)

    p = source_sub.add_parser("set-schedule", help="update the cron schedule")
    p.add_argument("id")
    p.add_argument("cron")
    p.set_defaults(func=source_set_schedule)

    p = source_sub.add_parser("stats", help="show row count / last run / failures")
    p.add_argument("id")
    p.set_defaults(func=source_stats)

    queue = sub.add_parser("queue", help="operate on the task queue")
    queue_sub = queue.add_subparsers(dest="action", required=True)
    queue_sub.add_parser("status", help="show counts per queue/status").set_defaults(func=queue_status)

    p = sub.add_parser("changes", help="show the changes feed")
    p.add_argument("--source", dest="source", default=None, help="filter by source id")
    p.set_defaults(func=changes)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
