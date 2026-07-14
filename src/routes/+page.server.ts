import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { normalizeEmail } from '$lib/server/user-access';

type PresenceStatus = 'online' | 'away' | 'offline';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!platform?.env?.DB) {
		// Dev fallback: return empty lobby
		return { games: [], usersPresence: [], onlineUsersCount: 0, user: locals.user };
	}

	const adminEmail = normalizeEmail(platform.env.ADMIN_EMAIL ?? '');
	let games: Array<{
		id: string;
		phase: string;
		created_at: string;
		host_name: string;
		player_count: number;
	}> = [];

	if (locals.user) {
		const gamesQuery = await platform.env.DB.prepare(
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
			}>();
		games = gamesQuery.results;
	}

	const onlineUsersCountResult = await platform.env.DB.prepare(
		`SELECT COUNT(*) AS total
		 FROM users u
		 WHERE u.last_active_at >= datetime('now', '-10 minutes')
		   AND (
		   	 LOWER(u.email) = ?
		   	 OR EXISTS(
		   	 	SELECT 1
		   	 	FROM user_allowlist a
		   	 	WHERE a.email = LOWER(u.email)
		   	 )
		   )`
	)
		.bind(adminEmail)
		.first<{ total: number }>();

	let usersPresence: Array<{ id: string; name: string; status: PresenceStatus }> = [];
	if (locals.user) {
		const usersPresenceQuery = await platform.env.DB.prepare(
			`SELECT u.id, u.name,
			        CASE
			        	WHEN u.last_active_at >= datetime('now', '-10 minutes') THEN 'online'
			        	WHEN u.last_active_at >= datetime('now', '-30 minutes') THEN 'away'
			        	ELSE 'offline'
			        END AS status
			 FROM users u
			 ORDER BY
			 	CASE
			 		WHEN u.last_active_at >= datetime('now', '-10 minutes') THEN 0
			 		WHEN u.last_active_at >= datetime('now', '-30 minutes') THEN 1
			 		ELSE 2
			 	END,
			 	u.last_active_at DESC,
			 	u.name COLLATE NOCASE ASC`
		)
			.all<{ id: string; name: string; status: PresenceStatus }>();
		usersPresence = usersPresenceQuery.results;
	}

	return {
		games,
		onlineUsersCount: onlineUsersCountResult?.total ?? 0,
		usersPresence,
		user: locals.user
	};
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
