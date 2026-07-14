ALTER TABLE users ADD COLUMN last_active_at TEXT;

-- Keep NULL as default: users are marked active by hooks on authenticated requests.
UPDATE users
SET last_active_at = (
	SELECT MAX(s.created_at)
	FROM sessions s
	WHERE s.user_id = users.id
);
