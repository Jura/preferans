import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!platform?.env?.DB) {
		// Dev fallback: return empty lobby
		return { games: [], user: locals.user };
	}

	const games = await platform.env.DB.prepare(
		`SELECT g.id, g.phase, g.created_at,
		        u.name AS host_name,
		        COALESCE(COUNT(gp.player_id), 0) AS player_count
		 FROM games g
		 JOIN users u ON u.id = g.host_id
		 LEFT JOIN game_players gp ON gp.game_id = g.id
		 WHERE g.phase IN ('waiting', 'dealing', 'bidding', 'playing')
		 GROUP BY g.id
		 ORDER BY g.created_at DESC
		 LIMIT 20`
	)
		.all<{
			id: string;
			phase: string;
			created_at: string;
			host_name: string;
			player_count: number;
		}>()
		.then((r) => r.results);

	return { games, user: locals.user };
};

export const actions = {
	createGame: async ({ locals, platform }) => {
		if (!locals.user) {
			redirect(303, '/auth/login');
		}

		if (!platform?.env?.DB) {
			return { error: 'Database not available' };
		}

		const gameId = crypto.randomUUID();
		await platform.env.DB.prepare(
			`INSERT INTO games (id, host_id, phase, created_at) VALUES (?, ?, 'waiting', datetime('now'))`
		)
			.bind(gameId, locals.user.id)
			.run();

		await platform.env.DB.prepare(
			`INSERT INTO game_players (game_id, player_id, position) VALUES (?, ?, 0)`
		)
			.bind(gameId, locals.user.id)
			.run();

		redirect(303, `/game/${gameId}`);
	}
};
