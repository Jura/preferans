-- Migration 0001: Initial schema for Преферанс

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,          -- 'google_{sub}'
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    avatar_url  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- WebSocket authentication tokens (short-lived)
CREATE TABLE IF NOT EXISTS ws_tokens (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id     TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ws_tokens_expires ON ws_tokens(expires_at);

CREATE TABLE IF NOT EXISTS games (
    id          TEXT PRIMARY KEY,
    host_id     TEXT NOT NULL REFERENCES users(id),
    phase       TEXT NOT NULL DEFAULT 'waiting',
    -- JSON blob of full game state (managed by Durable Object, mirrored here)
    state_json  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_games_phase ON games(phase);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at);

CREATE TABLE IF NOT EXISTS game_players (
    game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL CHECK(position IN (0, 1, 2)),
    PRIMARY KEY (game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_game_players_player ON game_players(player_id);

-- Historical record of each game round for statistics
CREATE TABLE IF NOT EXISTS game_rounds (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round_num   INTEGER NOT NULL,
    -- JSON: { declarerId, contract, scores: {playerId: number} }
    result_json TEXT NOT NULL,
    played_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_rounds_game ON game_rounds(game_id);
