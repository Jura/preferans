import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	if (!locals.user) {
		redirect(303, '/auth/login');
	}

	if (!platform?.env?.DB) {
		// Dev mode: return stub game data
		return {
			gameId: params.id,
			user: locals.user,
			sessionToken: 'dev-token'
		};
	}

	// Verify the game exists
	const game = await platform.env.DB.prepare(`SELECT id, phase FROM games WHERE id = ?`)
		.bind(params.id)
		.first<{ id: string; phase: string }>();

	if (!game) {
		error(404, 'Игра не найдена');
	}

	// Auto-join if there's room and user isn't already a player
	const existingPlayer = await platform.env.DB.prepare(
		`SELECT player_id FROM game_players WHERE game_id = ? AND player_id = ?`
	)
		.bind(params.id, locals.user.id)
		.first();

	if (!existingPlayer && game.phase === 'waiting') {
		const playerCount = await platform.env.DB.prepare(
			`SELECT COUNT(*) as cnt FROM game_players WHERE game_id = ?`
		)
			.bind(params.id)
			.first<{ cnt: number }>();

		if (playerCount && playerCount.cnt < 3) {
			const position = playerCount.cnt;
			await platform.env.DB.prepare(
				`INSERT INTO game_players (game_id, player_id, position) VALUES (?, ?, ?)`
			)
				.bind(params.id, locals.user.id, position)
				.run();
		}
	}

	// Issue a short-lived signed token for the WebSocket
	// In production, use a proper signing approach; here we use a simple UUID stored in DB
	const wsToken = crypto.randomUUID();
	await platform.env.DB.prepare(
		`INSERT INTO ws_tokens (token, user_id, game_id, expires_at)
		 VALUES (?, ?, ?, datetime('now', '+5 minutes'))
		 ON CONFLICT DO NOTHING`
	)
		.bind(wsToken, locals.user.id, params.id)
		.run();

	return {
		gameId: params.id,
		user: locals.user,
		sessionToken: wsToken
	};
};
