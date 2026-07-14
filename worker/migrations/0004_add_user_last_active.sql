ALTER TABLE users ADD COLUMN last_active_at TEXT;

UPDATE users
SET last_active_at = (
	SELECT MAX(s.created_at)
	FROM sessions s
	WHERE s.user_id = users.id
);
