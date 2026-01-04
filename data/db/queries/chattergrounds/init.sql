CREATE TABLE IF NOT EXISTS chattergrounds_stats (
    broadcaster_id TEXT,
    chatter_id TEXT,
    name TEXT,
    toadcoins INTEGER DEFAULT 0,
    toadcoins_minted INTEGER DEFAULT 0,
    times_banned INTEGER DEFAULT 0,
    times_timed_out INTEGER DEFAULT 0,
    quests_completed INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    months_subbed INTEGER DEFAULT 0,
    donos_gifted REAL DEFAULT 0,
    -- Joke fields
    estimated_age INTEGER,
    favorite_word TEXT,
    favorite_emote TEXT,
    last_message TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (broadcaster_id, chatter_id)
);

-- NEW: time-bucketed message counts for real graphs
CREATE TABLE IF NOT EXISTS chattergrounds_pulse (
    broadcaster_id TEXT NOT NULL,
    bucket_start INTEGER NOT NULL, -- unix ms (aligned to minute/hour/day depending on query)
    messages INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (broadcaster_id, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_chattergrounds_pulse_broadcaster_bucket
ON chattergrounds_pulse(broadcaster_id, bucket_start);
