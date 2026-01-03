-- data/db/queries/chattergrounds/init.sql
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
    estimated_age INTEGER DEFAULT 0,
    favorite_word TEXT,
    favorite_emote TEXT,
    donos_gifted REAL DEFAULT 0,
    last_message TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (broadcaster_id, chatter_id)
);
