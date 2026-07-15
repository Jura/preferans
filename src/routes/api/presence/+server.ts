import type { RequestHandler } from './$types';

/**
 * PATCH /api/presence
 * Updates `last_active_at` for the authenticated user.
 * Called by the client-side presence store on activity heartbeats.
 * Throttled server-side to at most once per minute to reduce D1 writes.
 */
export const PATCH: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user || !platform?.env?.DB) {
		return new Response(null, { status: 204 });
	}

	await platform.env.DB.prepare(
		`UPDATE users
		 SET last_active_at = datetime('now')
		 WHERE id = ?
		   AND (
		   	last_active_at IS NULL
		   	OR last_active_at < datetime('now', '-1 minute')
		   )`
	)
		.bind(locals.user.id)
		.run();

	return new Response(null, { status: 204 });
};
