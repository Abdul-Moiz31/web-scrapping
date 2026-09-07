CREATE TABLE IF NOT EXISTS pokemon (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    height INTEGER,
    weight INTEGER,
    base_experience INTEGER,
    sprite_url TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rick_and_morty (
    id SERIAL PRIMARY KEY,
    external_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    status TEXT,
    species TEXT,
    image_url TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coins (
    id SERIAL PRIMARY KEY,
    coin_id TEXT UNIQUE,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    current_price DOUBLE PRECISION,
    market_cap BIGINT,
    image_url TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    queue_name TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    locked_at TIMESTAMP,
    lock_token UUID,
    run_after TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    source_id TEXT NOT NULL,
    minute_bucket TIMESTAMP NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, minute_bucket)
);

CREATE TABLE IF NOT EXISTS source_settings (
    source_id TEXT PRIMARY KEY,
    cron_schedule TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    cron_schedule TEXT NOT NULL DEFAULT '*/10 * * * *',
    max_requests_per_minute INT NOT NULL DEFAULT 60,
    created_at TIMESTAMP DEFAULT NOW(),
    pagination_status TEXT
);

CREATE TABLE IF NOT EXISTS custom_source_rows (
    id SERIAL PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES custom_sources(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    data JSONB NOT NULL,
    fetched_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (source_id, item_key)
);

-- Append-only history: one row per save, written alongside the upsert into
-- the table above rather than instead of it. `data` holds the full row as
-- JSONB (not mirrored typed columns) so this schema stays stable even if a
-- source's typed columns change later.
CREATE TABLE IF NOT EXISTS pokemon_history (
    id SERIAL PRIMARY KEY,
    pokemon_id INT NOT NULL REFERENCES pokemon(id),
    data JSONB NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rick_and_morty_history (
    id SERIAL PRIMARY KEY,
    rick_and_morty_id INT NOT NULL REFERENCES rick_and_morty(id),
    data JSONB NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coins_history (
    id SERIAL PRIMARY KEY,
    coins_id INT NOT NULL REFERENCES coins(id),
    data JSONB NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_source_rows_history (
    id SERIAL PRIMARY KEY,
    custom_source_rows_id INT NOT NULL REFERENCES custom_source_rows(id),
    data JSONB NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- Stage 14: one entry per detected change (not per save -- unchanged saves
-- write nothing here). changed_fields is a small summary of what differed,
-- not the full before/after row.
CREATE TABLE IF NOT EXISTS changes (
    id SERIAL PRIMARY KEY,
    source_id TEXT NOT NULL,
    row_identifier TEXT NOT NULL,
    changed_fields JSONB NOT NULL,
    detected_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS changes_source_detected_idx ON changes (source_id, detected_at DESC);
