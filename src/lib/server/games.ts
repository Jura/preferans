import {
	ACTIVE_TABLE_PHASES,
	BULLET_TARGET_STEP,
	DEFAULT_BULLET_TARGET,
	LOBBY_TABLE_PHASES,
	MAX_PLAYERS,
	MAX_BULLET_TARGET,
	MIN_BULLET_TARGET
} from '$lib/constants/game';

type Database = App.Platform['env']['DB'];

const ACTIVE_TABLE_PHASES_SQL = ACTIVE_TABLE_PHASES.map(() => '?').join(', ');
const LOBBY_TABLE_PHASES_SQL = LOBBY_TABLE_PHASES.map(() => '?').join(', ');

export function getActiveTablePhasesSql() {
	return ACTIVE_TABLE_PHASES_SQL;
}

export function getActiveTablePhaseBindings() {
	return [...ACTIVE_TABLE_PHASES];
}

export function getLobbyTablePhasesSql() {
	return LOBBY_TABLE_PHASES_SQL;
}

export function getLobbyTablePhaseBindings() {
	return [...LOBBY_TABLE_PHASES];
}

export async function findActiveGameForUser(
	db: Database,
	userId: string,
	options: { excludeGameId?: string } = {}
) {
	const { excludeGameId } = options;

	return db
		.prepare(
			`SELECT g.id
			 FROM games g
			 JOIN game_players gp ON gp.game_id = g.id
			 WHERE gp.player_id = ?
			   AND g.phase IN (${ACTIVE_TABLE_PHASES_SQL})
			   ${excludeGameId ? 'AND g.id != ?' : ''}
			 ORDER BY g.created_at DESC
			 LIMIT 1`
		)
		.bind(
			...(excludeGameId
				? [userId, ...getActiveTablePhaseBindings(), excludeGameId]
				: [userId, ...getActiveTablePhaseBindings()])
		)
		.first<{ id: string }>();
}

export function parseBulletTarget(value: FormDataEntryValue | null) {
	if (value === null) {
		return DEFAULT_BULLET_TARGET;
	}

	const bulletTarget = Number(value);
	if (
		!Number.isInteger(bulletTarget) ||
		bulletTarget < MIN_BULLET_TARGET ||
		bulletTarget > MAX_BULLET_TARGET ||
		bulletTarget % BULLET_TARGET_STEP !== 0
	) {
		return null;
	}

	return bulletTarget;
}

export function findNextOpenSeat(occupiedPositions: number[]) {
	const occupied = new Set(occupiedPositions);
	return Array.from({ length: MAX_PLAYERS }, (_, position) => position).find(
		(position) => !occupied.has(position)
	);
}

export async function cleanupStaleGames(db: Database) {
	await db.batch([
		// Incomplete waiting tables: close after 1 hour.
		db.prepare(
			`UPDATE games
			 SET phase = 'finished', updated_at = datetime('now')
			 WHERE phase = 'waiting'
			   AND COALESCE(is_pinned, 0) = 0
			   AND created_at <= datetime('now', '-1 hour')
			   AND id IN (
			   	SELECT g.id
			   	FROM games g
			   	LEFT JOIN game_players gp ON gp.game_id = g.id
			   	WHERE g.phase = 'waiting'
			   	  AND COALESCE(g.is_pinned, 0) = 0
			   	  AND g.created_at <= datetime('now', '-1 hour')
			   	GROUP BY g.id
			   	HAVING COUNT(gp.player_id) < 3
			   )`
		),
		// Active non-paused tables: forfeit after 1 hour inactivity.
		db.prepare(
			`UPDATE games
			 SET phase = 'finished', updated_at = datetime('now')
			 WHERE phase IN ('dealing', 'bidding', 'widow', 'discard', 'playing', 'scoring')
			   AND COALESCE(is_pinned, 0) = 0
			   AND updated_at <= datetime('now', '-1 hour')`
		),
		// Paused tables: dismiss at requested deadline or after one week inactivity.
		db.prepare(
			`UPDATE games
			 SET phase = 'finished', updated_at = datetime('now')
			 WHERE phase = 'paused'
			   AND COALESCE(is_pinned, 0) = 0
			   AND (
			   	(paused_until IS NOT NULL AND paused_until <= datetime('now'))
			   	OR updated_at <= datetime('now', '-7 days')
			   )`
		)
	]);
}
