# Web Scrapper Dashboard

A multi-source web scraper with a Postgres-backed task queue, a cron
scheduler, rate limiting, and a Next.js dashboard to trigger runs and watch
results live.

## What's implemented

- **Multi-source scraping** — three sources scraped through the same
  pipeline: [PokeAPI](https://pokeapi.co/), the
  [Rick and Morty API](https://rickandmortyapi.com/), and
  [CoinGecko markets](https://www.coingecko.com/en/api). Adding a new source
  is a single entry in `app/sources/registry.py` — nothing else in the
  codebase branches on a source's name.
- **Custom sources** — users can register their own source via the API/UI
  (`POST /custom-sources`) instead of only the three built-in ones.
- **Task queue** — every scrape is broken into `discover` and `extract`
  tasks stored in Postgres and picked up by two worker processes
  (`worker-fetch`, `worker-save`), so fetching and saving scale
  independently.
- **Crash safety** — killing/restarting a worker mid-run never loses or
  duplicates rows; in-flight tasks are safely retried.
- **Automatic retries with backoff** — failed tasks are retried with
  backoff up to an attempt cap before being marked failed.
- **Cron scheduler** — each source runs on its own schedule
  (`APScheduler`), auto-enqueuing `discover` tasks with no manual trigger
  needed.
- **Rate limiting** — a Postgres-backed, per-source, per-minute counter
  (atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`) gates every
  outbound request; a rate-limited task is requeued instead of failed.
- **Realistic requests** — all outbound requests go through one HTTP
  helper that sends a real browser User-Agent and a matching Referer.
- **Live dashboard** — trigger or stop a scrape per source, watch the task
  queue and failed-task list update by polling, see per-source row counts,
  last-updated time, and current rate-limit usage, and browse scraped rows
  as cards or raw JSON.

## Stack

**Backend**
- **FastAPI** — REST API (source management, triggering/stopping scrapes,
  task/activity/rate-limit stats)
- **APScheduler** — cron-style scheduling to auto-enqueue scrape tasks per
  source
- **httpx** — outbound HTTP requests to target sites/APIs
- **psycopg** — Postgres driver, used directly (no ORM) for the task queue
  and scraped data tables
- **python-dotenv** — loads backend config from `.env`

**Frontend**
- **Next.js (App Router) + TypeScript** — dashboard UI and routing
- **React** — component model, polling hooks for live updates
- **Tailwind CSS** — styling

**Infra**
- **PostgreSQL** — task queue + scraped data storage
- **Docker Compose** — runs Postgres, the API, and both workers as one
  stack

## Project structure

```
backend/
  app/
    main.py        # FastAPI app + routes
    db.py           # Postgres connection helpers
    queue.py        # task queue read/write
    worker.py        # fetch/save worker loop
    scheduler.py     # cron scheduling of discover tasks
    http.py          # shared HTTP client (User-Agent/Referer)
    rate_limit.py     # per-source per-minute rate limiter
    sources/         # one module per source + the registry
  db/schema.sql       # Postgres schema
frontend/
  app/               # pages (dashboard, source detail, settings, new source)
  components/         # dashboard UI components
  lib/                # API client, types, polling hooks
docker-compose.yml
```

## Running it

### 1. Start Postgres + backend API + both workers

```bash
docker compose up --build -d
```

This starts four containers: `postgres`, `api`, `worker-fetch`, and
`worker-save`. The scheduler starts with the API container and immediately
begins enqueuing tasks on each source's cron schedule.

Useful commands:
```bash
docker compose ps              # check all 4 containers are up
docker compose logs -f api     # tail one service's logs
docker compose down            # stop everything (keeps the pgdata volume)
```

Check it's up: `curl http://localhost:8000/sources` should return the
built-in sources.

### 2. Start the frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # adjust NEXT_PUBLIC_API_URL if you changed the backend port
npm run dev
```

Open `http://localhost:3000`. Pick a source tab and click "Run scrape" to
trigger it, or wait for the scheduler to trigger it automatically. The task
queue view updates live until tasks settle to `done`, then the active
source's table refreshes.

### Defaults

- Postgres: user `postgres`, password `postgres`, db `pokemon_scraper`,
  port `5432`
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`

Change these in `docker-compose.yml` / `frontend/.env.local` if needed.
