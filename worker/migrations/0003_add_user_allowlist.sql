CREATE TABLE IF NOT EXISTS user_allowlist (
    email       TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
