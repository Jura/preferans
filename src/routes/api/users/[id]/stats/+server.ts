import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	if (!platform?.env?.DB) {
		// Dev fallback
		return json({
			id: params.id,
			name: params.id,
			email: '',
			lastActiveAt: null,
			gamesPlayed: 0,
			cumulativeScore: 0,
			leaderboardRank: 1
		});
	}

	const userId = params.id;

	// Fetch user basic info
	const user = await platform.env.DB.prepare(
		`SELECT id, name, email, last_active_at FROM users WHERE id = ?`
	)
		.bind(userId)
		.first<{ id: string; name: string; email: string; last_active_at: string | null }>();

	if (!user) {
		error(404, 'User not found');
	}

	// Count games played (as a seated player in any non-waiting game)
	const gamesPlayedResult = await platform.env.DB.prepare(
		`SELECT COUNT(DISTINCT gp.game_id) AS cnt
		 FROM game_players gp
		 JOIN games g ON g.id = gp.game_id
		 WHERE gp.player_id = ?
		   AND g.phase != 'waiting'`
	)
		.bind(userId)
		.first<{ cnt: number }>();

	// Cumulative final-settlement score across all finished games.
	// game_rounds stores the running scores in result_json -> scores.<playerId>.
	// We take the highest round_num per finished game (= final state of that game).
	const scoreResult = await platform.env.DB.prepare(
		`WITH final_rounds AS (
		   SELECT gr.result_json
		   FROM game_rounds gr
		   INNER JOIN (
		     SELECT game_id, MAX(round_num) AS max_round
		     FROM game_rounds
		     GROUP BY game_id
		   ) latest ON gr.game_id = latest.game_id AND gr.round_num = latest.max_round
		   WHERE gr.game_id IN (SELECT id FROM games WHERE phase = 'finished')
		 )
		 SELECT COALESCE(SUM(CAST(json_extract(result_json, '$.scores.' || ?) AS INTEGER)), 0) AS total
		 FROM final_rounds
		 WHERE json_extract(result_json, '$.scores.' || ?) IS NOT NULL`
	)
		.bind(userId, userId)
		.first<{ total: number }>();

	// Leaderboard rank: how many authorized players have a higher cumulative score?
	const rankResult = await platform.env.DB.prepare(
		`WITH final_rounds AS (
		   SELECT gr.game_id, gr.result_json
		   FROM game_rounds gr
		   INNER JOIN (
		     SELECT game_id, MAX(round_num) AS max_round
		     FROM game_rounds
		     GROUP BY game_id
		   ) latest ON gr.game_id = latest.game_id AND gr.round_num = latest.max_round
		   WHERE gr.game_id IN (SELECT id FROM games WHERE phase = 'finished')
		 ),
		 player_totals AS (
		   SELECT s.key AS player_id, SUM(CAST(s.value AS INTEGER)) AS total
		   FROM final_rounds, json_each(json_extract(result_json, '$.scores')) AS s
		   GROUP BY s.key
		 )
		 SELECT COUNT(*) + 1 AS rank
		 FROM player_totals
		 WHERE total > COALESCE((SELECT total FROM player_totals WHERE player_id = ?), 0)`
	)
		.bind(userId)
		.first<{ rank: number }>();

	return json({
		id: user.id,
		name: user.name,
		email: user.email,
		lastActiveAt: user.last_active_at,
		gamesPlayed: gamesPlayedResult?.cnt ?? 0,
		cumulativeScore: scoreResult?.total ?? 0,
		leaderboardRank: rankResult?.rank ?? 1
	});
};
