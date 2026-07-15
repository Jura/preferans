/**
 * Shared D1 SQL helpers used by multiple Durable Object classes.
 */

/**
 * Updates `last_active_at` for a user to the current time.
 * The WHERE condition throttles writes to at most once per minute so that
 * frequent pings (e.g. every 15–30 s) don't saturate D1 with redundant writes.
 * Bind the user id as the single parameter.
 */
export const UPDATE_LAST_ACTIVE_SQL = `UPDATE users SET last_active_at = datetime('now')
 WHERE id = ? AND (last_active_at IS NULL OR last_active_at < datetime('now', '-1 minute'))`;
