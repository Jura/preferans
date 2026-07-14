import { error, fail, redirect } from '@sveltejs/kit';
import { DEFAULT_BULLET_TARGET, MAX_PLAYERS } from '$lib/constants/game';
import { findActiveGameForUser, findNextOpenSeat } from '$lib/server/games';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	if (!locals.user) {
		redirect(303, '/auth/login');
	}

	if (!platform?.env?.DB) {
		// Dev mode: return stub game data
		return {
			bulletTarget: DEFAULT_BULLET_TARGET,
			createdAt: new Date().toISOString(),
			gameId: params.id,
			isPlayer: true,
			user: locals.user,
			sessionToken: 'dev-token'
		};
	}

	// Verify the game exists
	const game = await platform.env.DB.prepare(
		`SELECT id, phase, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at, bullet_target
		 FROM games
		 WHERE id = ?`
	)
		.bind(params.id)
		.first<{ id: string; phase: string; created_at: string; bullet_target: number }>();

	if (!game) {
		error(404, 'Game not found');
	}

	const otherActiveGame = await findActiveGameForUser(platform.env.DB, locals.user.id, {
		excludeGameId: params.id
	});
	if (otherActiveGame) {
		redirect(303, `/game/${otherActiveGame.id}`);
	}

	// Auto-join if there's room and user isn't already a player
	const existingPlayer = await platform.env.DB.prepare(
		`SELECT player_id FROM game_players WHERE game_id = ? AND player_id = ?`
	)
		.bind(params.id, locals.user.id)
		.first();

	if (!existingPlayer && game.phase === 'waiting') {
		const occupiedSeats = await platform.env.DB.prepare(
			`SELECT position FROM game_players WHERE game_id = ? ORDER BY position`
		)
			.bind(params.id)
			.all<{ position: number }>();
		const occupiedSeatPositions = new Set<number>(
			occupiedSeats.results.map((seat: { position: number }) => seat.position)
		);

		if (occupiedSeatPositions.size < MAX_PLAYERS) {
			const nextOpenSeat = findNextOpenSeat([...occupiedSeatPositions]);

			if (nextOpenSeat !== undefined) {
				await platform.env.DB.prepare(
					`INSERT INTO game_players (game_id, player_id, position) VALUES (?, ?, ?)`
				)
					.bind(params.id, locals.user.id, nextOpenSeat)
					.run();
			}
		}
	}

	const isPlayer = Boolean(
		await platform.env.DB.prepare(`SELECT 1 FROM game_players WHERE game_id = ? AND player_id = ?`)
			.bind(params.id, locals.user.id)
			.first()
	);

	// Issue a short-lived token for the WebSocket (UUID is unique by nature)
	const wsToken = crypto.randomUUID();
	await platform.env.DB.prepare(
		`INSERT INTO ws_tokens (token, user_id, game_id, expires_at)
		 VALUES (?, ?, ?, datetime('now', '+5 minutes'))`
	)
		.bind(wsToken, locals.user.id, params.id)
		.run();

	return {
		bulletTarget: game.bullet_target,
		createdAt: game.created_at,
		gameId: params.id,
		isPlayer,
		user: locals.user,
		sessionToken: wsToken
	};
};

export const actions = {
	leaveTable: async ({ params, locals, platform }) => {
		if (!locals.user) {
			redirect(303, '/auth/login');
		}

		if (!platform?.env?.DB) {
			return fail(503, { leaveTable: true });
		}

		const game = await platform.env.DB.prepare(`SELECT phase, host_id FROM games WHERE id = ?`)
			.bind(params.id)
			.first<{ phase: string; host_id: string }>();
		if (!game) {
			error(404, 'Game not found');
		}

		if (game.phase !== 'waiting') {
			return fail(400, { leaveTable: true });
		}

		const player = await platform.env.DB.prepare(
			`SELECT 1 FROM game_players WHERE game_id = ? AND player_id = ?`
		)
			.bind(params.id, locals.user.id)
			.first();
		if (!player) {
			redirect(303, '/');
		}

		await platform.env.DB.batch([
			platform.env.DB.prepare(`DELETE FROM game_players WHERE game_id = ? AND player_id = ?`).bind(
				params.id,
				locals.user.id
			),
			platform.env.DB.prepare(`DELETE FROM ws_tokens WHERE game_id = ? AND user_id = ?`).bind(
				params.id,
				locals.user.id
			)
		]);

		const remainingPlayers = await platform.env.DB.prepare(
			`SELECT player_id FROM game_players WHERE game_id = ? ORDER BY position`
		)
			.bind(params.id)
			.all<{ player_id: string }>();

		if (remainingPlayers.results.length === 0) {
			await platform.env.DB.batch([
				platform.env.DB.prepare(`DELETE FROM ws_tokens WHERE game_id = ?`).bind(params.id),
				platform.env.DB.prepare(`DELETE FROM games WHERE id = ?`).bind(params.id)
			]);
		} else if (game.host_id === locals.user.id) {
			await platform.env.DB.prepare(`UPDATE games SET host_id = ? WHERE id = ?`)
				.bind(remainingPlayers.results[0].player_id, params.id)
				.run();
		}

		redirect(303, '/');
	}
};
