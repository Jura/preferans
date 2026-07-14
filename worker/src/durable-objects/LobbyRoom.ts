export interface Env {
	DB: D1Database;
}

/**
 * Thresholds that mirror the server-side presence windows.
 * online ≤ 10 min, away ≤ 30 min, otherwise offline.
 */
const ONLINE_WINDOW = '-10 minutes';
const AWAY_WINDOW = '-30 minutes';

/**
 * How often (ms) the DO re-queries D1 and pushes updates to all connected
 * lobby clients when at least one client is connected.
 */
const POLL_INTERVAL_MS = 5_000;

interface LobbySession {
	ws: WebSocket;
	userId: string;
}

interface LobbyGame {
	id: string;
	phase: string;
	created_at: string;
	host_name: string;
	player_count: number;
	bullet_target: number;
}

interface UserPresence {
	id: string;
	name: string;
	status: 'online' | 'away' | 'offline';
}

type LobbyServerMessage =
	| { type: 'lobby_state'; games: LobbyGame[]; users: UserPresence[] }
	| {
			type: 'game_event';
			event: 'player_joined' | 'player_left';
			gameId: string;
			playerName: string;
	  }
	| { type: 'pong' }
	| { type: 'error'; message: string };

interface LobbyState {
	games: LobbyGame[];
	users: UserPresence[];
}

const AUTHORIZED_USERS_FILTER = `(
	EXISTS(
		SELECT 1 FROM user_allowlist a
		WHERE a.email = LOWER(u.email)
	)
)`;

export class LobbyRoom implements DurableObject {
	private state: DurableObjectState;
	private env: Env;
	private sessions: Map<string, LobbySession> = new Map();
	private lastState: LobbyState = { games: [], users: [] };

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// ── Internal notification from GameRoom ───────────────────────────────
		if (request.method === 'POST' && url.pathname.endsWith('/notify')) {
			// Immediately refresh and push to all lobby clients
			await this.refreshAndBroadcast();
			return new Response(null, { status: 204 });
		}

		// ── WebSocket upgrade ─────────────────────────────────────────────────
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 });
		}

		const token = url.searchParams.get('token');
		if (!token) {
			return new Response('Missing token', { status: 401 });
		}

		// Validate lobby token (game_id IS NULL)
		const tokenRow = await this.env.DB.prepare(
			`SELECT t.user_id, u.name
			 FROM ws_tokens t
			 JOIN users u ON u.id = t.user_id
			 WHERE t.token = ? AND t.expires_at > datetime('now') AND t.used = 0
			   AND t.game_id IS NULL`
		)
			.bind(token)
			.first<{ user_id: string; name: string }>();

		if (!tokenRow) {
			return new Response('Invalid or expired token', { status: 401 });
		}

		// Mark token as used
		await this.env.DB.prepare(`UPDATE ws_tokens SET used = 1 WHERE token = ?`).bind(token).run();

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.state.acceptWebSocket(server);

		const sessionId = crypto.randomUUID();
		(server as unknown as { sessionId: string }).sessionId = sessionId;
		this.sessions.set(sessionId, { ws: server, userId: tokenRow.user_id });

		// Send current state immediately to the new client
		await this.refreshAndBroadcastToSocket(server);

		// Ensure the polling alarm is scheduled
		await this.ensureAlarm();

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
		const msg = this.parseMessage(data);
		if (!msg) return;

		if (msg.type === 'ping') {
			this.sendToSocket(ws, { type: 'pong' });
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		this.removeSession(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		this.removeSession(ws);
	}

	async alarm(): Promise<void> {
		if (this.sessions.size === 0) {
			// No clients – let the alarm lapse; it will be re-scheduled on next connect
			return;
		}
		await this.refreshAndBroadcast();
		// Reschedule as long as clients are connected
		await this.ensureAlarm();
	}

	// ─── Private helpers ────────────────────────────────────────────────────────

	private parseMessage(data: string | ArrayBuffer): { type: string } | null {
		try {
			return JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
		} catch {
			return null;
		}
	}

	private getSessionId(ws: WebSocket): string {
		return (ws as unknown as { sessionId: string }).sessionId;
	}

	private removeSession(ws: WebSocket) {
		const sessionId = this.getSessionId(ws);
		if (sessionId) this.sessions.delete(sessionId);
	}

	private async ensureAlarm() {
		const current = await this.state.storage.getAlarm();
		if (current === null) {
			await this.state.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
		}
	}

	private async fetchLobbyState(): Promise<LobbyState> {
		const [gamesResult, usersResult] = await Promise.all([
			this.env.DB.prepare(
				`SELECT g.id, g.phase,
				        strftime('%Y-%m-%dT%H:%M:%SZ', g.created_at) AS created_at,
				        u.name AS host_name,
				        g.bullet_target,
				        COALESCE(COUNT(gp.player_id), 0) AS player_count
				 FROM games g
				 JOIN users u ON u.id = g.host_id
				 LEFT JOIN game_players gp ON gp.game_id = g.id
				 WHERE g.phase IN ('waiting', 'dealing', 'bidding', 'widow', 'discard', 'playing', 'scoring')
				 GROUP BY g.id
				 ORDER BY g.created_at DESC
				 LIMIT 20`
			).all<LobbyGame>(),
			this.env.DB.prepare(
				`WITH presence AS (
					SELECT
						u.id,
						u.name,
						CASE
							WHEN u.last_active_at >= datetime('now', ?) THEN 'online'
							WHEN u.last_active_at >= datetime('now', ?) THEN 'away'
							ELSE 'offline'
						END AS status
					FROM users u
					WHERE ${AUTHORIZED_USERS_FILTER}
				)
				SELECT id, name, status
				FROM presence
				ORDER BY
					CASE status WHEN 'online' THEN 0 WHEN 'away' THEN 1 ELSE 2 END,
					name COLLATE NOCASE ASC`
			)
				.bind(ONLINE_WINDOW, AWAY_WINDOW)
				.all<UserPresence>()
		]);

		return {
			games: gamesResult.results,
			users: usersResult.results
		};
	}

	private async refreshAndBroadcast() {
		const newState = await this.fetchLobbyState();
		this.lastState = newState;

		const msg: LobbyServerMessage = {
			type: 'lobby_state',
			games: newState.games,
			users: newState.users
		};

		for (const [, session] of this.sessions) {
			this.sendToSocket(session.ws, msg);
		}
	}

	private async refreshAndBroadcastToSocket(ws: WebSocket) {
		const newState = await this.fetchLobbyState();
		this.lastState = newState;
		this.sendToSocket(ws, {
			type: 'lobby_state',
			games: newState.games,
			users: newState.users
		});
	}

	private sendToSocket(ws: WebSocket, msg: LobbyServerMessage) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// ignore
		}
	}
}

/**
 * Thresholds that mirror the server-side presence windows.
 * online ≤ 10 min, away ≤ 30 min, otherwise offline.
 */
const ONLINE_WINDOW = '-10 minutes';
const AWAY_WINDOW = '-30 minutes';

/**
 * How often (ms) the DO re-queries D1 and pushes updates to all connected
 * lobby clients when at least one client is connected.
 */
const POLL_INTERVAL_MS = 5_000;

interface LobbySession {
	ws: WebSocket;
	userId: string;
}

interface LobbyState {
	games: LobbyGame[];
	users: UserPresence[];
}

const AUTHORIZED_USERS_FILTER = `(
	EXISTS(
		SELECT 1 FROM user_allowlist a
		WHERE a.email = LOWER(u.email)
	)
)`;

export class LobbyRoom implements DurableObject {
	private state: DurableObjectState;
	private env: Env;
	private sessions: Map<string, LobbySession> = new Map();
	private lastState: LobbyState = { games: [], users: [] };

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// ── Internal notification from GameRoom ───────────────────────────────
		if (request.method === 'POST' && url.pathname.endsWith('/notify')) {
			// Immediately refresh and push to all lobby clients
			await this.refreshAndBroadcast();
			return new Response(null, { status: 204 });
		}

		// ── WebSocket upgrade ─────────────────────────────────────────────────
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 });
		}

		const token = url.searchParams.get('token');
		if (!token) {
			return new Response('Missing token', { status: 401 });
		}

		// Validate lobby token (game_id IS NULL)
		const tokenRow = await this.env.DB.prepare(
			`SELECT t.user_id, u.name
			 FROM ws_tokens t
			 JOIN users u ON u.id = t.user_id
			 WHERE t.token = ? AND t.expires_at > datetime('now') AND t.used = 0
			   AND t.game_id IS NULL`
		)
			.bind(token)
			.first<{ user_id: string; name: string }>();

		if (!tokenRow) {
			return new Response('Invalid or expired token', { status: 401 });
		}

		// Mark token as used
		await this.env.DB.prepare(`UPDATE ws_tokens SET used = 1 WHERE token = ?`).bind(token).run();

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.state.acceptWebSocket(server);

		const sessionId = crypto.randomUUID();
		(server as unknown as { sessionId: string }).sessionId = sessionId;
		this.sessions.set(sessionId, { ws: server, userId: tokenRow.user_id });

		// Send current state immediately to the new client
		await this.refreshAndBroadcastToSocket(server);

		// Ensure the polling alarm is scheduled
		await this.ensureAlarm();

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
		const msg = this.parseMessage(data);
		if (!msg) return;

		if (msg.type === 'ping') {
			this.sendToSocket(ws, { type: 'pong' });
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		this.removeSession(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		this.removeSession(ws);
	}

	async alarm(): Promise<void> {
		if (this.sessions.size === 0) {
			// No clients – let the alarm lapse; it will be re-scheduled on next connect
			return;
		}
		await this.refreshAndBroadcast();
		// Reschedule as long as clients are connected
		await this.ensureAlarm();
	}

	// ─── Private helpers ────────────────────────────────────────────────────────

	private parseMessage(data: string | ArrayBuffer): { type: string } | null {
		try {
			return JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
		} catch {
			return null;
		}
	}

	private getSessionId(ws: WebSocket): string {
		return (ws as unknown as { sessionId: string }).sessionId;
	}

	private removeSession(ws: WebSocket) {
		const sessionId = this.getSessionId(ws);
		if (sessionId) this.sessions.delete(sessionId);
	}

	private async ensureAlarm() {
		const current = await this.state.storage.getAlarm();
		if (current === null) {
			await this.state.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
		}
	}

	private async fetchLobbyState(): Promise<LobbyState> {
		const [gamesResult, usersResult] = await Promise.all([
			this.env.DB.prepare(
				`SELECT g.id, g.phase,
				        strftime('%Y-%m-%dT%H:%M:%SZ', g.created_at) AS created_at,
				        u.name AS host_name,
				        g.bullet_target,
				        COALESCE(COUNT(gp.player_id), 0) AS player_count
				 FROM games g
				 JOIN users u ON u.id = g.host_id
				 LEFT JOIN game_players gp ON gp.game_id = g.id
				 WHERE g.phase IN ('waiting', 'dealing', 'bidding', 'widow', 'discard', 'playing', 'scoring')
				 GROUP BY g.id
				 ORDER BY g.created_at DESC
				 LIMIT 20`
			).all<LobbyGame>(),
			this.env.DB.prepare(
				`WITH presence AS (
					SELECT
						u.id,
						u.name,
						CASE
							WHEN u.last_active_at >= datetime('now', ?) THEN 'online'
							WHEN u.last_active_at >= datetime('now', ?) THEN 'away'
							ELSE 'offline'
						END AS status
					FROM users u
					WHERE ${AUTHORIZED_USERS_FILTER}
				)
				SELECT id, name, status
				FROM presence
				ORDER BY
					CASE status WHEN 'online' THEN 0 WHEN 'away' THEN 1 ELSE 2 END,
					name COLLATE NOCASE ASC`
			)
				.bind(ONLINE_WINDOW, AWAY_WINDOW)
				.all<UserPresence>()
		]);

		return {
			games: gamesResult.results,
			users: usersResult.results
		};
	}

	private async refreshAndBroadcast() {
		const newState = await this.fetchLobbyState();
		this.lastState = newState;

		const msg: LobbyServerMessage = {
			type: 'lobby_state',
			games: newState.games,
			users: newState.users
		};

		for (const [, session] of this.sessions) {
			this.sendToSocket(session.ws, msg);
		}
	}

	private async refreshAndBroadcastToSocket(ws: WebSocket) {
		const newState = await this.fetchLobbyState();
		this.lastState = newState;
		this.sendToSocket(ws, {
			type: 'lobby_state',
			games: newState.games,
			users: newState.users
		});
	}

	private sendToSocket(ws: WebSocket, msg: LobbyServerMessage) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// ignore
		}
	}
}
