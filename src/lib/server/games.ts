import {
	ACTIVE_TABLE_PHASES,
	BULLET_TARGET_STEP,
	DEFAULT_BULLET_TARGET,
	MAX_BULLET_TARGET,
	MIN_BULLET_TARGET
} from '$lib/constants/game';

type Database = App.Platform['env']['DB'];

const ACTIVE_TABLE_PHASES_SQL = ACTIVE_TABLE_PHASES.map((phase) => `'${phase}'`).join(', ');

export function getActiveTablePhasesSql() {
	return ACTIVE_TABLE_PHASES_SQL;
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
		.bind(...(excludeGameId ? [userId, excludeGameId] : [userId]))
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
