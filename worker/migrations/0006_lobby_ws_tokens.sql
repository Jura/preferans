-- Migration 0006: Allow lobby WebSocket tokens (game_id IS NULL)
-- Recreate ws_tokens with game_id as nullable so lobby connections
-- (which are not scoped to a specific game) can share the same table.

CREATE TABLE IF NOT EXISTS ws_tokens_new (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id     TEXT,                   -- NULL for lobby tokens
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0
);

INSERT INTO ws_tokens_new SELECT token, user_id, game_id, expires_at, used FROM ws_tokens;

DROP TABLE ws_tokens;

ALTER TABLE ws_tokens_new RENAME TO ws_tokens;

CREATE INDEX IF NOT EXISTS idx_ws_tokens_expires ON ws_tokens(expires_at);
