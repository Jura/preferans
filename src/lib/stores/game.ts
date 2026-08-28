import { writable, derived, get } from 'svelte/store';
import type {
	GameState,
	ClientMessage,
	ServerMessage,
	ConnectionQuality
} from '$lib/types/preferans';
import { toasts } from '$lib/stores/toasts';
import { t } from '$lib/i18n';
import { presence } from '$lib/stores/presence';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
const HEARTBEAT_INTERVAL_MS = 15000;
const DEGRADED_HEARTBEAT_INTERVAL_MS = 25000;
const STALE_CONNECTION_MS = 45000;
const DELAYED_ACTION_MS = 2500;
const ACCESS_REVOKED_CLOSE_CODE = 4401;
const RECONNECT_BASE_DELAY_MS = 800;
const RECONNECT_MAX_DELAY_MS = 30000;
type ActionStatus = 'idle' | 'sending' | 'delayed' | 'syncing';

interface GameStore {
	state: GameState | null;
	status: ConnectionStatus;
	error: string | null;
	connectionQuality: ConnectionQuality;
	latencyMs: number | null;
	isStale: boolean;
	pendingActions: number;
	actionStatus: ActionStatus;
}

function createGameStore() {
	const { subscribe, set, update } = writable<GameStore>({
		state: null,
		status: 'disconnected',
		error: null,
		connectionQuality: 'offline',
		latencyMs: null,
		isStale: false,
		pendingActions: 0,
		actionStatus: 'idle'
	});

	let ws: WebSocket | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
	let healthTimer: ReturnType<typeof setInterval> | null = null;
	let currentGameId: string | null = null;
	let reconnectAttempt = 0;
	let currentStateVersion = 0;
	let lastMessageAt = 0;
	let latencyMs: number | null = null;
	let manualDisconnect = false;
	let releasePresenceSender: (() => void) | null = null;
	const pendingPings = new Map<string, number>();
	const pendingActions = new Map<string, number>();

	/**
	 * Snapshot of players from the last received game_state, keyed by player id.
	 * Used to detect join/leave events for toast notifications.
	 * Null until the first state is received (so we don't toast on initial connect).
	 */
	let prevPlayers: Map<string, string> | null = null; // id → name

	function clearReconnect() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function clearHeartbeat() {
		if (heartbeatTimer) {
			clearTimeout(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	function clearHealthTimer() {
		if (healthTimer) {
			clearInterval(healthTimer);
			healthTimer = null;
		}
	}

	/**
	 * Schedule a reconnect attempt with exponential backoff.
	 * The original token is single-use so we fetch a fresh token before each attempt.
	 */
	function scheduleReconnect(gameId: string) {
		clearReconnect();
		const delay =
			Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_DELAY_MS) +
			Math.floor(Math.random() * 500);
		reconnectAttempt++;
		reconnectTimer = setTimeout(() => {
			if (currentGameId !== gameId) return;
			fetch(`/api/game/${gameId}/ws-token`)
				.then((res) => (res.ok ? (res.json() as Promise<{ token: string }>) : null))
				.then((data) => {
					if (data?.token && currentGameId === gameId) {
						connect(gameId, data.token);
					} else if (currentGameId === gameId) {
						// Token fetch failed (e.g. server returned non-OK) – retry.
						scheduleReconnect(gameId);
					}
				})
				.catch(() => {
					if (currentGameId === gameId) {
						// Network error – retry with backoff.
						scheduleReconnect(gameId);
					}
				});
		}, delay);
	}

	function connect(gameId: string, token: string) {
		currentGameId = gameId;
		prevPlayers = null;
		manualDisconnect = false;
		latencyMs = null;
		pendingPings.clear();
		clearReconnect();

		if (ws) {
			const previousSocket = ws;
			ws = null;
			previousSocket.close();
		}

		update((s) => ({
			...s,
			status: 'connecting',
			error: null,
			connectionQuality: 'offline',
			latencyMs: null,
			actionStatus: s.state ? 'syncing' : 'idle'
		}));

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${protocol}//${window.location.host}/api/game/${gameId}/ws?token=${encodeURIComponent(token)}`;

		const socket = new WebSocket(url);
		ws = socket;

		socket.addEventListener('open', () => {
			if (ws !== socket) return;
			clearHeartbeat();
			reconnectAttempt = 0;
			lastMessageAt = Date.now();
			startHealthTimer();
			sendPing();
			releasePresenceSender?.();
			releasePresenceSender = presence.setActivitySender(() => send({ type: 'activity' }));
			update((s) => ({
				...s,
				status: 'connected',
				error: null,
				connectionQuality: 'good',
				isStale: false
			}));
		});

		socket.addEventListener('message', (event) => {
			if (ws !== socket) return;
			lastMessageAt = Date.now();
			update((s) => ({ ...s, isStale: false }));
			try {
				const msg: ServerMessage = JSON.parse(event.data as string);
				handleMessage(msg);
			} catch {
				console.error('Failed to parse server message', event.data);
			}
		});

		socket.addEventListener('close', (event) => {
			if (ws !== socket) return;
			ws = null;
			clearHeartbeat();
			clearHealthTimer();
			pendingPings.clear();
			latencyMs = null;
			releasePresenceSender?.();
			releasePresenceSender = null;
			pendingActions.clear();
			update((s) => ({
				...s,
				status: 'disconnected',
				connectionQuality: 'offline',
				latencyMs: null,
				isStale: false,
				pendingActions: 0,
				actionStatus: s.state ? 'syncing' : 'idle'
			}));
			// 4401 is a custom close code used by the server when a connected user's
			// allowlist access has been revoked.
			if (event.code === ACCESS_REVOKED_CLOSE_CODE) {
				clearReconnect();
				currentGameId = null;
				window.location.href = '/auth/denied';
				return;
			}
			if (!manualDisconnect && currentGameId) {
				scheduleReconnect(currentGameId);
			}
		});

		socket.addEventListener('error', () => {
			if (ws !== socket) return;
			releasePresenceSender?.();
			releasePresenceSender = null;
			update((s) => ({ ...s, status: 'error', error: 'Connection error' }));
		});
	}

	function startHealthTimer() {
		clearHealthTimer();
		releasePresenceSender?.();
		releasePresenceSender = null;
		healthTimer = setInterval(() => {
			const now = Date.now();
			const isStale = lastMessageAt > 0 && now - lastMessageAt > STALE_CONNECTION_MS;
			const hasDelayedAction = Array.from(pendingActions.values()).some(
				(sentAt) => now - sentAt > DELAYED_ACTION_MS
			);
			update((s) => ({
				...s,
				isStale,
				actionStatus: hasDelayedAction ? 'delayed' : pendingActions.size ? 'sending' : 'idle'
			}));
			if (isStale && ws?.readyState === WebSocket.OPEN) ws.close();
		}, 1000);
	}

	function scheduleHeartbeat() {
		clearHeartbeat();
		const interval =
			latencyMs !== null && latencyMs > 1200
				? DEGRADED_HEARTBEAT_INTERVAL_MS
				: HEARTBEAT_INTERVAL_MS;
		heartbeatTimer = setTimeout(sendPing, interval);
	}

	function sendPing() {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		const pingId = crypto.randomUUID();
		pendingPings.set(pingId, performance.now());
		ws.send(
			JSON.stringify({
				type: 'ping',
				pingId,
				knownStateVersion: currentStateVersion,
				clientRttMs: latencyMs === null ? undefined : Math.round(latencyMs)
			} satisfies ClientMessage)
		);
		scheduleHeartbeat();
	}

	function handleMessage(msg: ServerMessage) {
		switch (msg.type) {
			case 'game_state': {
				currentStateVersion = msg.state.stateVersion;
				// Detect player roster changes during the waiting phase and show toasts.
				// Notifications are intentionally limited to the 'waiting' phase: once the
				// game has started, player disconnects are handled by the server reconnect
				// logic and mid-game presence changes would be disruptive to the playing UX.
				// prevPlayers is null on the first message so we don't fire on initial load.
				if (msg.state.phase === 'waiting' && prevPlayers !== null) {
					const translate = get(t);
					const newPlayerMap = new Map(msg.state.players.map((p) => [p.id, p.name]));

					// Players who just joined
					for (const [id, name] of newPlayerMap) {
						if (!prevPlayers.has(id)) {
							toasts.add({
								type: 'info',
								message: translate('app.game.notifications.playerJoined', { name })
							});
						}
					}

					// Players who just left
					for (const [id, name] of prevPlayers) {
						if (!newPlayerMap.has(id)) {
							toasts.add({
								type: 'warning',
								message: translate('app.game.notifications.playerLeft', { name })
							});
						}
					}
				}

				// Snapshot current players for the next comparison
				prevPlayers = new Map(msg.state.players.map((p) => [p.id, p.name]));

				update((s) => ({
					...s,
					state: msg.state,
					actionStatus: pendingActions.size ? s.actionStatus : 'idle'
				}));
				break;
			}
			case 'game_patch': {
				const currentState = getCurrentState();
				if (!currentState || currentState.stateVersion !== msg.baseVersion) {
					sendPing();
					break;
				}
				handleMessage({
					type: 'game_state',
					state: {
						...currentState,
						...msg.patch,
						stateVersion: msg.stateVersion
					}
				});
				break;
			}
			case 'error':
				if (msg.actionId) pendingActions.delete(msg.actionId);
				update((s) => ({
					...s,
					error: msg.message,
					pendingActions: pendingActions.size,
					actionStatus: pendingActions.size ? 'sending' : 'idle'
				}));
				break;
			case 'action_ack':
				pendingActions.delete(msg.actionId);
				currentStateVersion = Math.max(currentStateVersion, msg.stateVersion);
				update((s) => ({
					...s,
					pendingActions: pendingActions.size,
					actionStatus: pendingActions.size ? 'sending' : 'idle'
				}));
				break;
			case 'pong': {
				if (msg.pingId) {
					const startedAt = pendingPings.get(msg.pingId);
					if (startedAt !== undefined) {
						const sample = performance.now() - startedAt;
						pendingPings.delete(msg.pingId);
						latencyMs = latencyMs === null ? sample : latencyMs * 0.7 + sample * 0.3;
						const connectionQuality: ConnectionQuality =
							latencyMs > 1200 ? 'poor' : latencyMs > 400 ? 'fair' : 'good';
						update((s) => ({ ...s, latencyMs: Math.round(latencyMs!), connectionQuality }));
					}
				}
				break;
			}
			default:
				// All other messages trigger a state refresh (server sends updated state)
				break;
		}
	}

	function send(msg: ClientMessage) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			const isAction = msg.type !== 'ping' && msg.type !== 'activity' && msg.type !== 'join';
			if (!isAction) {
				ws.send(JSON.stringify(msg));
				return;
			}

			if (pendingActions.size > 0) return;
			const actionId = crypto.randomUUID();
			pendingActions.set(actionId, Date.now());
			ws.send(JSON.stringify({ ...msg, actionId, knownStateVersion: currentStateVersion }));
			update((s) => ({
				...s,
				error: null,
				pendingActions: pendingActions.size,
				actionStatus: 'sending'
			}));
		}
	}

	function getCurrentState(): GameState | null {
		return get({ subscribe }).state;
	}

	function disconnect() {
		clearReconnect();
		clearHeartbeat();
		clearHealthTimer();
		prevPlayers = null;
		currentGameId = null;
		reconnectAttempt = 0;
		currentStateVersion = 0;
		manualDisconnect = true;
		latencyMs = null;
		pendingPings.clear();
		pendingActions.clear();
		ws?.close();
		ws = null;
		set({
			state: null,
			status: 'disconnected',
			error: null,
			connectionQuality: 'offline',
			latencyMs: null,
			isStale: false,
			pendingActions: 0,
			actionStatus: 'idle'
		});
	}

	return {
		subscribe,
		connect,
		disconnect,
		send
	};
}

export const game = createGameStore();

export const myHand = derived(game, ($game) => $game.state?.hand ?? []);
export const currentTrick = derived(game, ($game) => $game.state?.currentTrick ?? null);
export const gamePhase = derived(game, ($game) => $game.state?.phase ?? 'waiting');
