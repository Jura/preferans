const TEST_LOGIN_HOST_SUFFIX = 'preferans-6bq.pages.dev';
const DUMMY_USER_ID_PREFIX = 'dummy_';
const DUMMY_SESSION_TOKEN_PREFIX = 'dummy-session_';

type Database = App.Platform['env']['DB'];

export function isTestLoginHost(hostname: string): boolean {
	return hostname === TEST_LOGIN_HOST_SUFFIX || hostname.endsWith(`.${TEST_LOGIN_HOST_SUFFIX}`);
}

export function isTestLoginEnabled(url: URL): boolean {
	return isTestLoginHost(url.hostname);
}

export function isTestLoginConfigured(env?: App.Platform['env']): boolean {
	return Boolean(env?.TEST_LOGIN_SECRET);
}

export function isDummyUserId(userId: string): boolean {
	return userId.startsWith(DUMMY_USER_ID_PREFIX);
}

export function isDummySessionToken(sessionToken: string): boolean {
	return sessionToken.startsWith(DUMMY_SESSION_TOKEN_PREFIX);
}

export function createDummySessionToken(): string {
	return `${DUMMY_SESSION_TOKEN_PREFIX}${crypto.randomUUID()}`;
}

export async function cleanupExpiredDummySessions(db: Database) {
	await db.batch([
		db
			.prepare(`DELETE FROM ws_tokens WHERE user_id LIKE ? AND expires_at <= datetime('now')`)
			.bind(`${DUMMY_USER_ID_PREFIX}%`),
		db
			.prepare(`DELETE FROM sessions WHERE user_id LIKE ? AND expires_at <= datetime('now')`)
			.bind(`${DUMMY_USER_ID_PREFIX}%`)
	]);
}

export async function cleanupInactiveDummyUsers(db: Database) {
	await cleanupExpiredDummySessions(db);
	await db
		.prepare(
			`DELETE FROM games
			 WHERE phase = 'finished'
			   AND host_id IN (
			   	SELECT users.id
			   	FROM users
			   	WHERE id LIKE ?
			   	  AND NOT EXISTS (
			   	  	SELECT 1
			   	  	FROM sessions s
			   	  	WHERE s.user_id = users.id
			   	  	  AND s.expires_at > datetime('now')
			   	  )
			   	  AND NOT EXISTS (
			   	  	SELECT 1
			   	  	FROM ws_tokens w
			   	  	WHERE w.user_id = users.id
			   	  	  AND w.expires_at > datetime('now')
			   	  )
			   	  AND NOT EXISTS (
			   	  	SELECT 1
			   	  	FROM game_players gp
			   	  	JOIN games g ON g.id = gp.game_id
			   	  	WHERE gp.player_id = users.id
			   	  	  AND g.phase != 'finished'
			   	  )
			   	  AND NOT EXISTS (
			   	  	SELECT 1
			   	  	FROM games g
			   	  	WHERE g.host_id = users.id
			   	  	  AND g.phase != 'finished'
			   	  )
			   )`
		)
		.bind(`${DUMMY_USER_ID_PREFIX}%`)
		.run();
	await db
		.prepare(
			`DELETE FROM users
		 WHERE id LIKE ?
		   AND NOT EXISTS (
		   	SELECT 1
		   	FROM sessions s
		   	WHERE s.user_id = users.id
		   	  AND s.expires_at > datetime('now')
		   )
		   AND NOT EXISTS (
		   	SELECT 1
		   	FROM ws_tokens w
		   	WHERE w.user_id = users.id
		   	  AND w.expires_at > datetime('now')
		   )
		   AND NOT EXISTS (
		   	SELECT 1
		   	FROM game_players gp
		   	JOIN games g ON g.id = gp.game_id
		   	WHERE gp.player_id = users.id
		   	  AND g.phase != 'finished'
		   )
		   AND NOT EXISTS (
		   	SELECT 1
		   	FROM games g
		   	WHERE g.host_id = users.id
		   	  AND g.phase != 'finished'
		   )`
		)
		.bind(`${DUMMY_USER_ID_PREFIX}%`)
		.run();
}

export async function createDummyIdentity(db: Database) {
	await cleanupInactiveDummyUsers(db);

	const activeDummyCount = await db
		.prepare(
			`SELECT COUNT(*) AS total
			 FROM sessions
			 WHERE user_id LIKE ?
			   AND expires_at > datetime('now')`
		)
		.bind(`${DUMMY_USER_ID_PREFIX}%`)
		.first<{ total: number }>();

	const dummyNumber = (activeDummyCount?.total ?? 0) + 1;
	const dummyId = `${DUMMY_USER_ID_PREFIX}${crypto.randomUUID()}`;

	return {
		id: dummyId,
		name: `Dummy ${dummyNumber}`,
		email: `${dummyId}@example.invalid`
	};
}
