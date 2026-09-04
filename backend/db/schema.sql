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
