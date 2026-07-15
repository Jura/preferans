import type { RequestHandler } from './$types';

/**
 * GET /api/game/:id/ws-token
 *
 * Issues a fresh short-lived WebSocket token for a player who is already
 * seated at the given game.  Used by the game store to obtain a new token
 * before each reconnect attempt, since tokens are single-use and the
 * original page-load token is consumed on first connect.
 */
export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (!platform?.env?.DB) {
		return new Response('Platform not available', { status: 503 });
	}

	const gameId = params.id;

	// Confirm the user is actually a player in this game.
	const player = await platform.env.DB.prepare(
		`SELECT 1 FROM game_players WHERE game_id = ? AND player_id = ?`
	)
		.bind(gameId, locals.user.id)
		.first();

	if (!player) {
		return new Response('Not a player in this game', { status: 403 });
	}

	const token = crypto.randomUUID();
	await platform.env.DB.prepare(
		`INSERT INTO ws_tokens (token, user_id, game_id, expires_at)
		 VALUES (?, ?, ?, datetime('now', '+5 minutes'))`
	)
		.bind(token, locals.user.id, gameId)
		.run();

	return new Response(JSON.stringify({ token }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
