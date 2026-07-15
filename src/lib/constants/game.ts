export const MIN_BULLET_TARGET = 30;
export const MAX_BULLET_TARGET = 200;
export const BULLET_TARGET_STEP = 10;
export const DEFAULT_BULLET_TARGET = 100;
export const MAX_PLAYERS = 3;

export const ACTIVE_TABLE_PHASES = [
	'waiting',
	'dealing',
	'bidding',
	'widow',
	'discard',
	'playing',
	'scoring'
] as const;

export const LOBBY_TABLE_PHASES = [...ACTIVE_TABLE_PHASES, 'paused'] as const;
