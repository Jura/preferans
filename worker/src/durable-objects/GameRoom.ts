import type { GameState, PlayerId, Card, Bid, FinishProposal, PauseProposal } from '../gameEngine';
import {
	createInitialState,
	startRound,
	applyBid,
	applyWidowSelection,
	applyPlayCard
} from '../gameEngine';
import { UPDATE_LAST_ACTIVE_SQL } from '../db';

export interface Env {
	DB: D1Database;
	/** Optional: if bound, GameRoom will notify LobbyRoom on game state changes */
	LOBBY_ROOM?: DurableObjectNamespace;
}

interface WebSocketSession {
	ws: WebSocket;
	playerId: PlayerId;
	playerName: string;
}

interface AccessStatusCacheEntry {
	allowed: boolean;
	expiresAt: number;
}

const MS_PER_MINUTE = 60 * 1000;

type ClientMessage =
	| { type: 'join'; token: string }
	| { type: 'bid'; bid: Bid }
	| { type: 'select_widow'; keep: [Card, Card] }
	| { type: 'play_card'; card: Card }
	| { type: 'request_finish_early' }
	| { type: 'vote_finish_early'; approve: boolean }
	| { type: 'request_pause'; durationMinutes: number | null }
	| { type: 'vote_pause'; approve: boolean }
	| { type: 'start_round' }
	| { type: 'ping' }
	| { type: 'activity' };

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
	finishProposal: FinishProposal | null;
	pauseProposal: PauseProposal | null;
	pausedUntil: string | null;
}

export class GameRoom implements DurableObject {
	// Keep the cache short so revoked users are disconnected quickly while still
	// avoiding a D1 lookup on every ping and in-game action.
	private static readonly ACCESS_CACHE_TTL_MS = 5000;
	private state: DurableObjectState;
	private env: Env;
	private sessions: Map<string, WebSocketSession> = new Map();
	private accessStatusCache: Map<PlayerId, AccessStatusCacheEntry> = new Map();
	private gameState: GameState | null = null;
	private gameId = '';
	private playerInfo: Map<PlayerId, { name: string; avatarUrl: string | null }> = new Map();

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
		// Restore in-memory sessions from any WebSockets that survived DO hibernation.
		// Cloudflare keeps accepted WebSockets alive across hibernation/eviction cycles;
		// the attachment holds the data we need to rebuild our sessions map.
		this.restoreSessionsFromHibernation();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		this.gameId = url.searchParams.get('gameId') ?? this.gameId;

		if (request.method === 'POST' && url.pathname.endsWith('/admin/deal-out')) {
			if (!this.gameState) {
				await this.loadGameState();
			}
			if (!this.gameState) {
				return new Response('Game state unavailable', { status: 404 });
			}
			if (this.gameState.phase !== 'waiting') {
				return new Response('Table is not waiting', { status: 409 });
			}
			if (this.gameState.playerIds.length !== 3) {
				return new Response('Need exactly 3 players', { status: 409 });
			}
			this.gameState = startRound({
				...this.gameState,
				playerIds: this.shufflePlayerIds(this.gameState.playerIds)
			});
			await this.persistState();
			this.broadcastState();
			return new Response(null, { status: 204 });
		}

		if (request.method === 'POST' && url.pathname.endsWith('/admin/dismiss')) {
			if (!this.gameState) {
				await this.loadGameState();
			}
			if (!this.gameState) {
				return new Response('Game state unavailable', { status: 404 });
			}
			this.gameState = {
				...this.gameState,
				phase: 'finished',
				currentPlayerId: null,
				finishProposal: null,
				pauseProposal: null,
				pausedUntil: null
			};
			await this.persistState();
			this.broadcastState();
			return new Response(null, { status: 204 });
		}

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
		const rosterChanged = await this.syncWaitingPlayersFromDatabase();

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.state.acceptWebSocket(server);

		const sessionId = crypto.randomUUID();
		this.sessions.set(sessionId, { ws: server, playerId, playerName: tokenRow.name });

		// Attach session id to the WebSocket for later retrieval
		(server as unknown as { sessionId: string }).sessionId = sessionId;

		// Persist session metadata on the WebSocket so it can be recovered after
		// the DO wakes from hibernation (in-memory sessions are cleared on sleep).
		server.serializeAttachment({
			playerId,
			playerName: tokenRow.name,
			avatarUrl: tokenRow.avatar_url,
			sessionId
		});

		// Send current state to the newly connected player
		this.sendToSocket(server, {
			type: 'game_state',
			state: this.buildClientState(playerId)
		});
		if (rosterChanged) {
			this.broadcastState();
		}

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

	/**
	 * Rebuild the in-memory sessions map from WebSockets that survived DO hibernation.
	 * Called in the constructor so every handler starts with a populated sessions map,
	 * ensuring broadcasts reach all connected players even after the DO was evicted.
	 */
	private restoreSessionsFromHibernation(): void {
		for (const ws of this.state.getWebSockets()) {
			const att = ws.deserializeAttachment() as {
				playerId: string;
				playerName: string;
				avatarUrl: string | null;
				sessionId: string;
			} | null;
			if (!att?.sessionId) continue;
			this.sessions.set(att.sessionId, { ws, playerId: att.playerId, playerName: att.playerName });
			(ws as unknown as { sessionId: string }).sessionId = att.sessionId;
			this.playerInfo.set(att.playerId, { name: att.playerName, avatarUrl: att.avatarUrl });
		}
	}

	private getSession(ws: WebSocket): WebSocketSession | undefined {
		const sessionId = (ws as unknown as { sessionId: string }).sessionId;
		return this.sessions.get(sessionId);
	}

	private removeSession(ws: WebSocket) {
		const sessionId = (ws as unknown as { sessionId: string }).sessionId;
		if (sessionId) this.sessions.delete(sessionId);
	}

	/** Re-check allowlist access so banned users are disconnected from active games promptly. */
	private async hasActiveAccess(userId: PlayerId) {
		const cached = this.accessStatusCache.get(userId);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.allowed;
		}

		const access = await this.env.DB.prepare(
			`SELECT 1
			 FROM users u
			 JOIN user_allowlist a ON a.email = LOWER(u.email)
			 WHERE u.id = ?`
		)
			.bind(userId)
			.first();

		const allowed = !!access;
		this.accessStatusCache.set(userId, {
			allowed,
			expiresAt: Date.now() + GameRoom.ACCESS_CACHE_TTL_MS
		});

		return allowed;
	}

	private async loadGameState() {
		const stored = await this.state.storage.get<GameState>('gameState');
		if (stored) {
			this.gameState = {
				...stored,
				finishProposal: stored.finishProposal ?? null,
				pauseProposal: stored.pauseProposal ?? null,
				pausedUntil: stored.pausedUntil ?? null
			};
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

	private async syncWaitingPlayersFromDatabase() {
		if (!this.gameState || this.gameState.phase !== 'waiting') {
			return false;
		}

		const players = await this.env.DB.prepare(
			`SELECT gp.player_id, gp.position, u.name, u.avatar_url
			 FROM game_players gp
			 JOIN users u ON u.id = gp.player_id
			 WHERE gp.game_id = ?
			 ORDER BY gp.position`
		)
			.bind(this.gameId)
			.all<{ player_id: string; position: number; name: string; avatar_url: string | null }>();

		for (const player of players.results) {
			this.playerInfo.set(player.player_id, {
				name: player.name,
				avatarUrl: player.avatar_url
			});
		}

		const playerIds = players.results.map((player) => player.player_id);
		const rosterChanged =
			playerIds.length !== this.gameState.playerIds.length ||
			playerIds.some((playerId, index) => this.gameState.playerIds[index] !== playerId);

		if (!rosterChanged) {
			return false;
		}

		const currentScores = this.gameState.scores ?? {};
		this.gameState = {
			...this.gameState,
			playerIds,
			scores: Object.fromEntries(
				playerIds.map((playerId) => [playerId, currentScores[playerId] ?? 0])
			)
		};

		// Auto-deal when the third player joins and randomize order at that point.
		if (playerIds.length === 3) {
			this.gameState = startRound({
				...this.gameState,
				playerIds: this.shufflePlayerIds(playerIds)
			});
		}
		await this.persistState();

		return true;
	}

	private async persistState() {
		if (!this.gameState) return;
		await this.state.storage.put('gameState', this.gameState);
		// Mirror phase to D1
		await this.env.DB.prepare(
			`UPDATE games SET phase = ?, paused_until = ?, updated_at = datetime('now') WHERE id = ?`
		)
			.bind(this.gameState.phase, this.gameState.pausedUntil, this.gameId)
			.run();
		// Notify lobby so it can push an up-to-date game list to lobby clients
		this.notifyLobby();
	}

	/** Fire-and-forget POST to LobbyRoom to trigger an immediate lobby refresh. */
	private notifyLobby() {
		if (!this.env.LOBBY_ROOM) return;
		try {
			const doId = this.env.LOBBY_ROOM.idFromName('global');
			const stub = this.env.LOBBY_ROOM.get(doId);
			// Fire-and-forget: we don't await this so game operations aren't blocked.
			// Errors are intentionally ignored – lobby updates are best-effort and
			// the LobbyRoom's own alarm-based polling will self-heal within 5 seconds.
			void stub.fetch(new Request('http://lobby/notify', { method: 'POST' })).catch(() => {});
		} catch {
			// LOBBY_ROOM not configured or idFromName failed – ignore
		}
	}

	/** Fisher-Yates shuffle used when seating is randomized as soon as the third player joins. */
	private shufflePlayerIds(playerIds: PlayerId[]) {
		const shuffled = [...playerIds];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	private createProposalVotes(playerIds: PlayerId[], proposerId: PlayerId) {
		return Object.fromEntries(
			playerIds.map((id) => [id, id === proposerId ? 'yes' : null])
		) as Record<PlayerId, 'yes' | 'no' | null>;
	}

	private proposalRejected(votes: Record<PlayerId, 'yes' | 'no' | null>) {
		return Object.values(votes).includes('no');
	}

	private proposalApproved(votes: Record<PlayerId, 'yes' | 'no' | null>) {
		return Object.values(votes).every((vote) => vote === 'yes');
	}

	private async handleMessage(session: WebSocketSession, msg: ClientMessage) {
		const { playerId } = session;

		switch (msg.type) {
			case 'ping':
				if (await this.syncWaitingPlayersFromDatabase()) {
					this.broadcastState();
				}
				this.sendToSocket(session.ws, { type: 'pong' });
				return;

			case 'activity':
				// Update the player's presence in D1 (throttled by the WHERE condition),
				// then immediately notify LobbyRoom so lobby clients see the updated presence.
				await this.env.DB.prepare(UPDATE_LAST_ACTIVE_SQL).bind(playerId).run();
				this.notifyLobby();
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
				this.gameState = startRound({
					...this.gameState,
					playerIds: this.shufflePlayerIds(this.gameState.playerIds)
				});
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

			case 'request_finish_early': {
				if (!this.gameState) return;
				if (this.gameState.phase === 'waiting' || this.gameState.phase === 'finished') {
					throw new Error('Early finish is only available after game start');
				}
				if (this.gameState.finishProposal || this.gameState.pauseProposal) {
					throw new Error('Another vote is already in progress');
				}
				this.gameState = {
					...this.gameState,
					finishProposal: {
						proposedBy: playerId,
						votes: this.createProposalVotes(this.gameState.playerIds, playerId)
					}
				};
				await this.persistState();
				this.broadcastState();
				return;
			}

			case 'vote_finish_early': {
				if (!this.gameState) return;
				const proposal = this.gameState.finishProposal;
				if (!proposal) {
					throw new Error('No early finish vote in progress');
				}
				if (proposal.proposedBy === playerId) {
					throw new Error("The proposer's vote is automatically counted as 'yes'");
				}
				const votes = {
					...proposal.votes,
					[playerId]: msg.approve ? 'yes' : 'no'
				} as Record<PlayerId, 'yes' | 'no' | null>;

				if (this.proposalRejected(votes)) {
					this.gameState = { ...this.gameState, finishProposal: null };
				} else if (this.proposalApproved(votes)) {
					this.gameState = {
						...this.gameState,
						phase: 'finished',
						currentPlayerId: null,
						finishProposal: null,
						pauseProposal: null,
						pausedUntil: null
					};
				} else {
					this.gameState = {
						...this.gameState,
						finishProposal: { ...proposal, votes }
					};
				}
				await this.persistState();
				this.broadcastState();
				return;
			}

			case 'request_pause': {
				if (!this.gameState) return;
				if (this.gameState.phase === 'waiting' || this.gameState.phase === 'finished') {
					throw new Error('Pause is only available after game start');
				}
				if (this.gameState.finishProposal || this.gameState.pauseProposal) {
					throw new Error('Another vote is already in progress');
				}
				if (
					msg.durationMinutes !== null &&
					(!Number.isInteger(msg.durationMinutes) || msg.durationMinutes <= 0)
				) {
					throw new Error('Pause duration must be a positive number of minutes');
				}
				this.gameState = {
					...this.gameState,
					pauseProposal: {
						proposedBy: playerId,
						durationMinutes: msg.durationMinutes,
						votes: this.createProposalVotes(this.gameState.playerIds, playerId)
					}
				};
				await this.persistState();
				this.broadcastState();
				return;
			}

			case 'vote_pause': {
				if (!this.gameState) return;
				const proposal = this.gameState.pauseProposal;
				if (!proposal) {
					throw new Error('No pause vote in progress');
				}
				if (proposal.proposedBy === playerId) {
					throw new Error("The proposer's vote is automatically counted as 'yes'");
				}
				const votes = {
					...proposal.votes,
					[playerId]: msg.approve ? 'yes' : 'no'
				} as Record<PlayerId, 'yes' | 'no' | null>;

				if (this.proposalRejected(votes)) {
					this.gameState = { ...this.gameState, pauseProposal: null };
				} else if (this.proposalApproved(votes)) {
					const pausedUntil =
						proposal.durationMinutes === null
							? null
							: new Date(Date.now() + proposal.durationMinutes * MS_PER_MINUTE).toISOString();
					this.gameState = {
						...this.gameState,
						phase: 'paused',
						currentPlayerId: null,
						pausedUntil,
						finishProposal: null,
						pauseProposal: null
					};
				} else {
					this.gameState = {
						...this.gameState,
						pauseProposal: { ...proposal, votes }
					};
				}
				await this.persistState();
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
			roundNumber: gs.roundNumber,
			finishProposal: gs.finishProposal ?? null,
			pauseProposal: gs.pauseProposal ?? null,
			pausedUntil: gs.pausedUntil ?? null
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
