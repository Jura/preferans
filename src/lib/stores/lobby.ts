import { writable } from 'svelte/store';
import type { LobbyGame, LobbyServerMessage, UserPresence } from '$lib/types/preferans';
import { toasts } from '$lib/stores/toasts';
import { get } from 'svelte/store';
import { t } from '$lib/i18n';

const HEARTBEAT_INTERVAL_MS = 20_000;

export interface LobbyState {
	games: LobbyGame[];
	users: UserPresence[];
	connected: boolean;
}

function createLobbyStore() {
	const { subscribe, set, update } = writable<LobbyState>({
		games: [],
		users: [],
		connected: false
	});

	let ws: WebSocket | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let currentToken: string | null = null;

	/** Track previous game player counts so we can detect join/leave in lobby */
	let prevGameCounts: Map<string, number> = new Map();

	function clearTimers() {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function connect(token: string) {
		if (ws) return; // already connected
		currentToken = token;

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${protocol}//${window.location.host}/api/lobby/ws?token=${encodeURIComponent(token)}`;

		ws = new WebSocket(url);

		ws.addEventListener('open', () => {
			update((s) => ({ ...s, connected: true }));
			heartbeatTimer = setInterval(() => {
				if (ws?.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'ping' }));
				}
			}, HEARTBEAT_INTERVAL_MS);
		});

		ws.addEventListener('message', (event) => {
			try {
				const msg: LobbyServerMessage = JSON.parse(event.data as string);
				handleMessage(msg);
			} catch {
				// ignore parse errors
			}
		});

		ws.addEventListener('close', () => {
			clearTimers();
			ws = null;
			update((s) => ({ ...s, connected: false }));
			// Reconnect once after a short delay (token may have been reused already)
		});

		ws.addEventListener('error', () => {
			ws = null;
			clearTimers();
			update((s) => ({ ...s, connected: false }));
		});
	}

	function handleMessage(msg: LobbyServerMessage) {
		switch (msg.type) {
			case 'lobby_state': {
				const translate = get(t);
				const newCounts = new Map<string, number>(msg.games.map((g) => [g.id, g.player_count]));

				// Detect player join/leave in waiting games and show lobby toast
				for (const [gameId, newCount] of newCounts) {
					const prevCount = prevGameCounts.get(gameId);
					const game = msg.games.find((g) => g.id === gameId);
					if (prevCount !== undefined && game && game.phase === 'waiting') {
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
				set({ games: msg.games, users: msg.users, connected: true });
				break;
			}
			case 'game_event':
				// Future: handle game_event messages for richer notifications
				break;
			case 'pong':
				break;
			default:
				break;
		}
	}

	function disconnect() {
		clearTimers();
		currentToken = null;
		ws?.close();
		ws = null;
		set({ games: [], users: [], connected: false });
	}

	return { subscribe, connect, disconnect };
}

export const lobby = createLobbyStore();
