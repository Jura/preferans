import type { GameState, PlayerId, Card, Bid } from '../gameEngine';
import {
	createInitialState,
	startRound,
	applyBid,
	applyWidowSelection,
	applyPlayCard
} from '../gameEngine';

export interface Env {
	DB: D1Database;
}

interface WebSocketSession {
	ws: WebSocket;
	playerId: PlayerId;
	playerName: string;
}

type ClientMessage =
	| { type: 'join'; token: string }
	| { type: 'bid'; bid: Bid }
	| { type: 'select_widow'; keep: [Card, Card] }
	| { type: 'play_card'; card: Card }
	| { type: 'start_round' }
	| { type: 'ping' };

type ServerMessage =
	| { type: 'game_state'; state: ClientGameState }
	| { type: 'error'; message: string }
	| { type: 'pong' };

/** Game state sent to clients (hands are filtered per player) */
interface ClientGameState {
	id: string;
	phase: string;
	players: { id: string; name: string; avatarUrl: string | null; position: number }[];
	currentPlayerId: string | null;
	hand: Card[];
	widow: Card[];
	currentTrick: GameState['currentTrick'];
	completedTricks: GameState['completedTricks'];
	bids: GameState['bids'];
	contract: GameState['contract'];
	declarerId: string | null;
	trump: string | null;
	scores: Record<string, number>;
	roundNumber: number;
}

export class GameRoom implements DurableObject {
	private state: DurableObjectState;
	private env: Env;
	private sessions: Map<string, WebSocketSession> = new Map();
	private gameState: GameState | null = null;
	private gameId = '';
	private playerInfo: Map<PlayerId, { name: string; avatarUrl: string | null }> = new Map();

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		this.gameId = url.searchParams.get('gameId') ?? this.gameId;

		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 });
		}

		// Validate token
		const token = url.searchParams.get('token');
		if (!token) {
			return new Response('Missing token', { status: 401 });
		}

		const tokenRow = await this.env.DB.prepare(
			`SELECT t.user_id, t.game_id, u.name, u.avatar_url
			 FROM ws_tokens t
			 JOIN users u ON u.id = t.user_id
			 WHERE t.token = ? AND t.expires_at > datetime('now') AND t.used = 0
			   AND t.game_id = ?`
		)
			.bind(token, this.gameId)
			.first<{ user_id: string; game_id: string; name: string; avatar_url: string | null }>();

		if (!tokenRow) {
			return new Response('Invalid or expired token', { status: 401 });
		}

		// Mark token as used
		await this.env.DB.prepare(`UPDATE ws_tokens SET used = 1 WHERE token = ?`).bind(token).run();

		const playerId = tokenRow.user_id;
		this.playerInfo.set(playerId, { name: tokenRow.name, avatarUrl: tokenRow.avatar_url });

		// Load or initialise game state
		if (!this.gameState) {
			await this.loadGameState();
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.state.acceptWebSocket(server);

		const sessionId = crypto.randomUUID();
		this.sessions.set(sessionId, { ws: server, playerId, playerName: tokenRow.name });

		// Attach session id to the WebSocket for later retrieval
		(server as unknown as { sessionId: string }).sessionId = sessionId;

		// Send current state to the newly connected player
		this.sendToSocket(server, {
			type: 'game_state',
			state: this.buildClientState(playerId)
		});

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
		const session = this.getSession(ws);
		if (!session) return;
		if (!(await this.hasActiveAccess(session.playerId))) {
			this.sendToSocket(ws, { type: 'error', message: 'Access revoked' });
			this.removeSession(ws);
			ws.close(4401, 'Access revoked');
			return;
		}

		let msg: ClientMessage;
		try {
			msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
		} catch {
			this.sendToSocket(ws, { type: 'error', message: 'Invalid JSON' });
			return;
		}

		try {
			await this.handleMessage(session, msg);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			this.sendToSocket(ws, { type: 'error', message });
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const session = this.getSession(ws);
		if (session) {
			this.removeSession(ws);
		}
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		this.removeSession(ws);
	}

	// ─── Private helpers ────────────────────────────────────────────────────────

	private getSession(ws: WebSocket): WebSocketSession | undefined {
		const sessionId = (ws as unknown as { sessionId: string }).sessionId;
		return this.sessions.get(sessionId);
	}

	private removeSession(ws: WebSocket) {
		const sessionId = (ws as unknown as { sessionId: string }).sessionId;
		if (sessionId) this.sessions.delete(sessionId);
	}

	private async hasActiveAccess(userId: PlayerId) {
		const access = await this.env.DB.prepare(
			`SELECT 1
			 FROM users u
			 JOIN user_allowlist a ON a.email = LOWER(u.email)
			 WHERE u.id = ?`
		)
			.bind(userId)
			.first();

		return !!access;
	}

	private async loadGameState() {
		const stored = await this.state.storage.get<GameState>('gameState');
		if (stored) {
			this.gameState = stored;
			return;
		}
		// Load player ids from DB
		const players = await this.env.DB.prepare(
			`SELECT gp.player_id, gp.position, u.name, u.avatar_url
			 FROM game_players gp JOIN users u ON u.id = gp.player_id
			 WHERE gp.game_id = ? ORDER BY gp.position`
		)
			.bind(this.gameId)
			.all<{ player_id: string; position: number; name: string; avatar_url: string | null }>();

		const playerIds = players.results.map((p) => p.player_id);
		for (const p of players.results) {
			this.playerInfo.set(p.player_id, { name: p.name, avatarUrl: p.avatar_url });
		}
		this.gameState = createInitialState(this.gameId, playerIds);
		await this.persistState();
	}

	private async persistState() {
		if (!this.gameState) return;
		await this.state.storage.put('gameState', this.gameState);
		// Mirror phase to D1
		await this.env.DB.prepare(
			`UPDATE games SET phase = ?, updated_at = datetime('now') WHERE id = ?`
		)
			.bind(this.gameState.phase, this.gameId)
			.run();
	}

	private async handleMessage(session: WebSocketSession, msg: ClientMessage) {
		const { playerId } = session;

		switch (msg.type) {
			case 'ping':
				this.sendToSocket(session.ws, { type: 'pong' });
				return;

			case 'start_round': {
				if (!this.gameState) return;
				// Only allowed when waiting or scoring and enough players
				if (this.gameState.phase !== 'waiting' && this.gameState.phase !== 'scoring') {
					throw new Error('Cannot start round in current phase');
				}
				if (this.gameState.playerIds.length !== 3) {
					throw new Error('Need exactly 3 players to start');
				}
				this.gameState = startRound(this.gameState);
				await this.persistState();
				this.broadcastState();
				return;
			}

			case 'bid': {
				if (!this.gameState) return;
				this.gameState = applyBid(this.gameState, playerId, msg.bid);
				await this.persistState();
				this.broadcastState();
				return;
			}

			case 'select_widow': {
				if (!this.gameState) return;
				this.gameState = applyWidowSelection(this.gameState, playerId, msg.keep);
				await this.persistState();
				this.broadcastState();
				return;
			}

			case 'play_card': {
				if (!this.gameState) return;
				this.gameState = applyPlayCard(this.gameState, playerId, msg.card);
				await this.persistState();
				// If round ended, save round result to DB
				if (this.gameState.phase === 'scoring') {
					await this.saveRoundResult();
				}
				this.broadcastState();
				return;
			}

			default:
				throw new Error('Unknown message type');
		}
	}

	private async saveRoundResult() {
		if (!this.gameState?.contract || !this.gameState.declarerId) return;
		await this.env.DB.prepare(
			`INSERT INTO game_rounds (game_id, round_num, result_json)
			 VALUES (?, ?, ?)`
		)
			.bind(
				this.gameId,
				this.gameState.roundNumber,
				JSON.stringify({
					declarerId: this.gameState.declarerId,
					contract: this.gameState.contract,
					scores: this.gameState.scores
				})
			)
			.run();
	}

	private buildClientState(forPlayerId: PlayerId): ClientGameState {
		const gs = this.gameState!;
		const players = gs.playerIds.map((id, idx) => ({
			id,
			name: this.playerInfo.get(id)?.name ?? id,
			avatarUrl: this.playerInfo.get(id)?.avatarUrl ?? null,
			position: idx as 0 | 1 | 2
		}));

		return {
			id: gs.id,
			phase: gs.phase,
			players,
			currentPlayerId: gs.currentPlayerId,
			hand: gs.hands[forPlayerId] ?? [],
			widow: gs.declarerId === forPlayerId ? gs.widow : [],
			currentTrick: gs.currentTrick,
			completedTricks: gs.completedTricks,
			bids: gs.bids,
			contract: gs.contract,
			declarerId: gs.declarerId,
			trump: gs.trump,
			scores: gs.scores,
			roundNumber: gs.roundNumber
		};
	}

	private broadcastState() {
		for (const [, session] of this.sessions) {
			try {
				this.sendToSocket(session.ws, {
					type: 'game_state',
					state: this.buildClientState(session.playerId)
				});
			} catch {
				// Session disconnected
			}
		}
	}

	private sendToSocket(ws: WebSocket, msg: ServerMessage) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// ignore send errors
		}
	}
}
