import { get, writable } from 'svelte/store';
import type {
	ConnectionQuality,
	LobbyClientMessage,
	LobbyGame,
	LobbyServerMessage,
	UserPresence
} from '$lib/types/preferans';
import { toasts } from '$lib/stores/toasts';
import { t } from '$lib/i18n';
import { presence } from '$lib/stores/presence';
import { isTestLoginHost } from '$lib/utils/test-login';

const HEARTBEAT_INTERVAL_MS = 20_000;
const DEGRADED_HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_CONNECTION_MS = 60_000;
const RECONNECT_BASE_DELAY_MS = 800;
const RECONNECT_MAX_DELAY_MS = 30_000;

type LobbyConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface LobbyState {
	games: LobbyGame[];
	users: UserPresence[];
	connected: boolean;
	hasSnapshot: boolean;
	status: LobbyConnectionStatus;
	connectionQuality: ConnectionQuality;
	latencyMs: number | null;
	isStale: boolean;
}

function createLobbyStore() {
	const { subscribe, set, update } = writable<LobbyState>({
		games: [],
		users: [],
		connected: false,
		hasSnapshot: false,
		status: 'disconnected',
		connectionQuality: 'offline',
		latencyMs: null,
		isStale: false
	});

	let ws: WebSocket | null = null;
	let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
	let healthTimer: ReturnType<typeof setInterval> | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let reconnectAttempt = 0;
	let enabled = false;
	let lastMessageAt = 0;
	let latencyMs: number | null = null;
	let releasePresenceSender: (() => void) | null = null;
	const pendingPings = new Map<string, number>();
	let prevGameCounts: Map<string, number> = new Map();

	function visibleGames(games: LobbyGame[]): LobbyGame[] {
		if (typeof window === 'undefined' || isTestLoginHost(window.location.hostname)) return games;
		return games.filter((game) => game.is_dummy !== 1);
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

	function clearReconnect() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function connect(token: string) {
		enabled = true;
		if (ws) return;
		openSocket(token, false);
	}

	function openSocket(token: string, reconnecting: boolean) {
		latencyMs = null;
		pendingPings.clear();
		update((state) => ({
			...state,
			connected: false,
			status: reconnecting ? 'reconnecting' : 'connecting',
			connectionQuality: 'offline',
			latencyMs: null,
			isStale: false
		}));

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${protocol}//${window.location.host}/api/lobby/ws?token=${encodeURIComponent(token)}`;
		const socket = new WebSocket(url);
		ws = socket;

		socket.addEventListener('open', () => {
			if (ws !== socket) return;
			reconnectAttempt = 0;
			lastMessageAt = Date.now();
			update((state) => ({
				...state,
				connected: true,
				status: 'connected',
				connectionQuality: 'good',
				isStale: false
			}));
			releasePresenceSender?.();
			releasePresenceSender = presence.setActivitySender(() => send({ type: 'activity' }));
			startHealthTimer();
			sendPing();
		});

		socket.addEventListener('message', (event) => {
			if (ws !== socket) return;
			lastMessageAt = Date.now();
			update((state) => ({ ...state, isStale: false }));
			try {
				handleMessage(JSON.parse(event.data as string) as LobbyServerMessage);
			} catch {
				console.error('Failed to parse lobby message');
			}
		});

		socket.addEventListener('close', () => {
			if (ws !== socket) return;
			ws = null;
			clearHeartbeat();
			clearHealthTimer();
			pendingPings.clear();
			latencyMs = null;
			releasePresenceSender?.();
			releasePresenceSender = null;
			update((state) => ({
				...state,
				connected: false,
				status: enabled ? 'reconnecting' : 'disconnected',
				connectionQuality: 'offline',
				latencyMs: null,
				isStale: false
			}));
			if (enabled) scheduleReconnect();
		});

		socket.addEventListener('error', () => {
			if (ws !== socket) return;
			update((state) => ({ ...state, status: 'error' }));
		});
	}

	function scheduleReconnect() {
		clearReconnect();
		const delay =
			Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS) +
			Math.floor(Math.random() * 500);
		reconnectAttempt++;
		reconnectTimer = setTimeout(async () => {
			if (!enabled || ws) return;
			try {
				const response = await fetch('/api/lobby/ws-token');
				if (response.status === 401 || response.status === 403) {
					enabled = false;
					update((state) => ({ ...state, status: 'error' }));
					return;
				}
				if (!response.ok) {
					scheduleReconnect();
					return;
				}
				const data = (await response.json()) as { token: string };
				if (enabled && !ws) openSocket(data.token, true);
			} catch {
				if (enabled) scheduleReconnect();
			}
		}, delay);
	}

	function startHealthTimer() {
		clearHealthTimer();
		healthTimer = setInterval(() => {
			const isStale = lastMessageAt > 0 && Date.now() - lastMessageAt > STALE_CONNECTION_MS;
			update((state) => ({ ...state, isStale }));
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
		send({
			type: 'ping',
			pingId,
			clientRttMs: latencyMs === null ? undefined : Math.round(latencyMs)
		});
		scheduleHeartbeat();
	}

	function send(message: LobbyClientMessage) {
		if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
	}

	function handleMessage(msg: LobbyServerMessage) {
		switch (msg.type) {
			case 'lobby_state': {
				const translate = get(t);
				const games = visibleGames(msg.games);
				const newCounts = new Map<string, number>(
					games.map((game) => [game.id, game.player_count])
				);

				for (const [gameId, newCount] of newCounts) {
					const prevCount = prevGameCounts.get(gameId);
					const game = games.find((candidate) => candidate.id === gameId);
					if (prevCount !== undefined && game?.phase === 'waiting') {
						if (newCount > prevCount) {
							toasts.add({
								type: 'info',
								message: translate('app.lobby.notifications.playerJoined', {
									hostName: game.host_name
								})
							});
						} else if (newCount < prevCount) {
							toasts.add({
								type: 'warning',
								message: translate('app.lobby.notifications.playerLeft', {
									hostName: game.host_name
								})
							});
						}
					}
				}

				prevGameCounts = newCounts;
				update((state) => ({
					...state,
					games,
					users: msg.users,
					connected: true,
					hasSnapshot: true,
					status: 'connected'
				}));
				break;
			}
			case 'pong': {
				if (!msg.pingId) break;
				const startedAt = pendingPings.get(msg.pingId);
				if (startedAt === undefined) break;
				pendingPings.delete(msg.pingId);
				const sample = performance.now() - startedAt;
				latencyMs = latencyMs === null ? sample : latencyMs * 0.7 + sample * 0.3;
				const connectionQuality: ConnectionQuality =
					latencyMs > 1200 ? 'poor' : latencyMs > 400 ? 'fair' : 'good';
				update((state) => ({
					...state,
					latencyMs: Math.round(latencyMs!),
					connectionQuality
				}));
				break;
			}
			default:
				break;
		}
	}

	function disconnect() {
		enabled = false;
		clearHeartbeat();
		clearHealthTimer();
		clearReconnect();
		releasePresenceSender?.();
		releasePresenceSender = null;
		const socket = ws;
		ws = null;
		socket?.close();
		latencyMs = null;
		pendingPings.clear();
		prevGameCounts = new Map();
		set({
			games: [],
			users: [],
			connected: false,
			hasSnapshot: false,
			status: 'disconnected',
			connectionQuality: 'offline',
			latencyMs: null,
			isStale: false
		});
	}

	return { subscribe, connect, disconnect };
}

export const lobby = createLobbyStore();
