import type { PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
	findActiveGameForUser,
	getActiveTablePhaseBindings,
	getActiveTablePhasesSql,
	parseBulletTarget
} from '$lib/server/games';
import { normalizeEmail } from '$lib/server/user-access';

type PresenceStatus = 'online' | 'away' | 'offline';
// Presence windows from issue #9: online <=10 minutes, away <=30 minutes, otherwise offline.
const ONLINE_WINDOW = '-10 minutes';
const AWAY_WINDOW = '-30 minutes';
const AUTHORIZED_USERS_FILTER = `(
	LOWER(u.email) = ?
	OR EXISTS(
		SELECT 1
		FROM user_allowlist a
		WHERE a.email = LOWER(u.email)
	)
)`;

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!platform?.env?.DB) {
		// Dev fallback: return empty lobby
		return {
			activeGameId: null,
			games: [],
			usersPresence: [],
			onlineUsersCount: 0,
			user: locals.user
		};
	}

	const adminEmail = normalizeEmail(platform.env.ADMIN_EMAIL ?? '');
	let games: Array<{
		id: string;
		phase: string;
		created_at: string;
		host_name: string;
		player_count: number;
		bullet_target: number;
	}> = [];
	const activeGame = locals.user
		? await findActiveGameForUser(platform.env.DB, locals.user.id)
		: null;

	if (locals.user) {
		const activeTablesFilter = getActiveTablePhasesSql();
		const activeTablePhaseBindings = getActiveTablePhaseBindings();
		const gamesQuery = await platform.env.DB.prepare(
			`SELECT g.id, g.phase,
			        strftime('%Y-%m-%dT%H:%M:%SZ', g.created_at) AS created_at,
			        u.name AS host_name,
			        g.bullet_target,
			        COALESCE(COUNT(gp.player_id), 0) AS player_count
			 FROM games g
			 JOIN users u ON u.id = g.host_id
			 LEFT JOIN game_players gp ON gp.game_id = g.id
			 WHERE g.phase IN (${activeTablesFilter})
			   ${activeGame ? 'AND g.id = ?' : ''}
			 GROUP BY g.id
			 ORDER BY g.created_at DESC
			 LIMIT 20`
		)
			.bind(
				...(activeGame ? [...activeTablePhaseBindings, activeGame.id] : activeTablePhaseBindings)
			)
			.all<{
				id: string;
				phase: string;
				created_at: string;
				host_name: string;
				player_count: number;
				bullet_target: number;
			}>();
		games = gamesQuery.results;
	}

	const onlineUsersCountResult = await platform.env.DB.prepare(
		`SELECT COUNT(*) AS total
		 FROM users u
		 WHERE u.last_active_at >= datetime('now', ?)
		   AND ${AUTHORIZED_USERS_FILTER}`
	)
		.bind(ONLINE_WINDOW, adminEmail)
		.first<{ total: number }>();

	let usersPresence: Array<{ id: string; name: string; status: PresenceStatus }> = [];
	if (locals.user) {
		const usersPresenceQuery = await platform.env.DB.prepare(
			`WITH presence AS (
				SELECT
					u.id,
					u.name,
					u.last_active_at,
					CASE
						WHEN u.last_active_at >= datetime('now', ?) THEN 'online'
						WHEN u.last_active_at >= datetime('now', ?) THEN 'away'
						ELSE 'offline'
					END AS status
				FROM users u
				WHERE ${AUTHORIZED_USERS_FILTER}
			)
			SELECT id, name, status, last_active_at
			FROM presence
			ORDER BY
				CASE status
					WHEN 'online' THEN 0
					WHEN 'away' THEN 1
					ELSE 2
				END,
				last_active_at DESC,
				name COLLATE NOCASE ASC`
		)
			.bind(ONLINE_WINDOW, AWAY_WINDOW, adminEmail)
			.all<{ id: string; name: string; status: PresenceStatus }>();
		usersPresence = usersPresenceQuery.results;
	}

	return {
		activeGameId: activeGame?.id ?? null,
		games,
		onlineUsersCount: onlineUsersCountResult?.total ?? 0,
		usersPresence,
		user: locals.user
	};
};

export const actions = {
	createGame: async ({ request, locals, platform }) => {
		if (!locals.user) {
			redirect(303, '/auth/login');
		}

		if (!platform?.env?.DB) {
			return { error: 'Database not available' };
		}

		const activeGame = await findActiveGameForUser(platform.env.DB, locals.user.id);
		if (activeGame) {
			redirect(303, `/game/${activeGame.id}`);
		}

		const formData = await request.formData();
		const bulletTarget = parseBulletTarget(formData.get('bulletTarget'));
		if (bulletTarget === null) {
			return fail(400, { invalidBulletTarget: true });
		}
		const gameId = crypto.randomUUID();
		await platform.env.DB.batch([
			platform.env.DB.prepare(
				`INSERT INTO games (id, host_id, bullet_target, phase, created_at)
				 VALUES (?, ?, ?, 'waiting', datetime('now'))`
			).bind(gameId, locals.user.id, bulletTarget),
			platform.env.DB.prepare(
				`INSERT INTO game_players (game_id, player_id, position) VALUES (?, ?, 0)`
			).bind(gameId, locals.user.id)
		]);

		redirect(303, `/game/${gameId}`);
	}
};
