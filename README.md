# Stage 5: Rate Limiting + Realistic Requests

Three independent sources scraped through the same Postgres-backed task
queue, plus a cron scheduler that auto-enqueues each source on its own
schedule.

## Sources

| Source | id | Table | List shape |
|---|---|---|---|
| [PokeAPI](https://pokeapi.co/) | `pokemon` | `pokemon` | Paginated list, one detail fetch per row |
| [Rick and Morty API](https://rickandmortyapi.com/) | `rickandmorty` | `rick_and_morty` | Paginated list, full row data already included -- no second fetch |
| [CoinGecko markets](https://www.coingecko.com/en/api) | `coingecko` | `coins` | One request, no pagination, full array immediately |

The spec originally called for REST Countries as the third source, but its
`/v3.1/all` and `/v5.0/all` endpoints are now both dead (they return an HTTP
200 with a deprecation error body and require signing up for an API key,
which breaks this project's public/no-auth rule for target sites). CoinGecko's
`/coins/markets` endpoint fills the same architectural role -- single request,
no pagination -- and needs no key.

Everything routes through `app/sources/registry.py`'s `SOURCES` dict --
that's the only place in the codebase that maps a source id to its code.
`worker.py` and `main.py` never branch on a source's name.

## Stack

- Postgres + backend API + both worker processes, all via Docker Compose --
  one `docker compose up` starts everything except the frontend
- Frontend: Next.js (App Router, TypeScript), run locally with `npm run dev`
  (kept local so edits hot-reload instantly, no container rebuild)

## Defaults

- Postgres: user `postgres`, password `postgres`, db `pokemon_scraper`, port `5432`
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`
- Cron schedules (dev-friendly, not production values): `pokemon` every 3
  minutes, `rickandmorty` every 4 minutes, `coingecko` every 5 minutes --
  see `cron_schedule` on each entry in `app/sources/registry.py`.

Change these in `docker-compose.yml` / `frontend/.env.local` if you want different values.

## Running it (2 steps)

### 1. Start Postgres + backend API + both workers

```bash
docker compose up --build -d
```

First run builds the backend image (used for the API and both workers, just
with a different command each); later runs reuse it unless
`requirements.txt` changed. `./backend` is mounted as a volume, so editing
backend code takes effect without rebuilding -- the API container runs
`uvicorn --reload`; a worker container needs a manual
`docker compose restart worker-fetch` (or `worker-save`) to pick up code
changes, since plain Python scripts have no reload flag.

The scheduler starts with the API container and immediately begins
enqueuing `discover` tasks on each source's cron schedule -- you don't need
to click anything for that to happen.

Useful commands:
```bash
docker compose ps              # check all 4 containers are up
docker compose logs -f api     # tail one service's logs
docker compose logs -f worker-fetch
docker compose down            # stop everything (keeps the pgdata volume)
```

Check `curl http://localhost:8000/sources` returns exactly 3 entries.

### 2. Start the frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # adjust NEXT_PUBLIC_API_URL if you changed the backend port
npm run dev
```

Open `http://localhost:3000`. Pick a source tab, click "Run scrape" to
trigger just that source, or just wait -- the scheduler will trigger all
three on its own. The task queue view is global (shows all sources' tasks
together) and polls every 2 seconds until everything settles to `done`, then
the active source's table refreshes.

## Rate limiting + realistic requests (Stage 5)

- `app/http.py`'s `fetch(url)` is the only way any code talks to a target
  site -- sends a real Chrome User-Agent and a Referer matching the target's
  own origin. All three sources' `discover()`/`extract()` go through it.
- `app/rate_limit.py`'s `is_allowed(source_id, max_per_minute)` is a Postgres
  counter, one row per `(source_id, current minute)`, incremented and checked
  in a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement --
  verified atomic under real concurrency (50 threads racing against a limit
  of 10 produced exactly 10 allowed, 40 denied, counter landed on exactly 50).
- Per-source limits, in `app/sources/registry.py`: `pokemon` 60/min (no
  limiting ever observed from pokeapi.co), `rickandmorty` 30/min (it actually
  429'd during Stage 4 testing under bursty pagination), `coingecko` 30/min
  (its public no-key tier is documented around 10-30/min).
- The check happens once per **task**, before calling `discover()` or
  `extract()` -- for `extract` tasks that's exactly one HTTP call, so the
  limit is genuinely per-request there. A `discover` task for a paginated
  source (`pokemon`, `rickandmorty`) is a single rate-limited unit even
  though it internally walks many pages in a loop -- once that one task
  clears the gate, its internal pagination isn't separately throttled. This
  matches the task-level design as specified; pushing the check inside
  pagination would mean threading rate-limit config into every source
  module, which is out of scope here.
- A rate-limited task is never marked failed -- it's put back to `pending`
  with `run_after` a few seconds out (`attempts` untouched, so it can never
  hit the 5-attempt failure cap from Stage 3's backoff). Verified live: with
  a temporarily-lowered limit, denied tasks stayed at `attempts: 0` and kept
  cycling back to pending every ~5s until their source's per-minute budget
  had room.
- Known rough edge: when many tasks are rate-limited at once, the fetch
  worker doesn't pace between denials -- it only sleeps when the queue is
  completely empty, so a big backlog under a tight limit means rapid
  denied-and-requeue cycling (high CPU, many DB round trips) rather than a
  smooth trickle. Real requests are still correctly capped either way; this
  is a performance rough edge, not a correctness one. Not fixed here since
  the explicit constraint is "don't add sleep as a substitute for real rate
  limiting," and a denial-triggered pause is a judgment call worth a
  deliberate decision rather than a silent patch.
- `GET /sources/{id}/rate-limit` returns `{source_id, count, max_per_minute}`
  for the current minute; the frontend shows it per source next to the task
  queue view. Note `count` reflects every attempt (including denied ones),
  not just successful ones -- that's what the underlying counter tracks.

## Notes

- Running a full scrape twice still inserts duplicate rows -- still expected,
  same as Stage 1.
- Crash safety from Stage 3 (kill/restart either worker mid-run, no lost or
  duplicated rows) is unchanged and applies across all three sources.
- `rickandmorty`'s `extract()` makes no HTTP request -- the list endpoint
  already returns full character data, so `discover()` packages it directly
  into the task and `extract()` just reshapes it. Flagged with a comment in
  `app/sources/rickandmorty.py` since it looks different from the other two
  sources' `extract()`.
- `coingecko`'s `discover()` is the zero-pagination case: one request returns
  everything, so each row is packaged into its own task the same way, just
  with nothing left for `extract()` to fetch either.
