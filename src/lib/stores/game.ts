import { writable, derived, get } from 'svelte/store';
import type { GameState, ClientMessage, ServerMessage } from '$lib/types/preferans';
import { toasts } from '$lib/stores/toasts';
import { t } from '$lib/i18n';
import { presence } from '$lib/stores/presence';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
const HEARTBEAT_INTERVAL_MS = 15000;
const ACCESS_REVOKED_CLOSE_CODE = 4401;

interface GameStore {
	state: GameState | null;
	status: ConnectionStatus;
	error: string | null;
}

function createGameStore() {
	const { subscribe, set, update } = writable<GameStore>({
		state: null,
		status: 'disconnected',
		error: null
	});

	let ws: WebSocket | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let currentGameId: string | null = null;

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
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	function connect(gameId: string, token: string) {
		currentGameId = gameId;
		prevPlayers = null;
		clearReconnect();

		if (ws) {
			ws.close();
			ws = null;
		}

		update((s) => ({ ...s, status: 'connecting', error: null }));

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${protocol}//${window.location.host}/api/game/${gameId}/ws?token=${encodeURIComponent(token)}`;

		ws = new WebSocket(url);

		ws.addEventListener('open', () => {
			clearHeartbeat();
			// Check access frequently enough to revoke removed users quickly without sending
			// unnecessary traffic on every animation or UI update.
			heartbeatTimer = setInterval(() => {
				send({ type: 'ping' });
			}, HEARTBEAT_INTERVAL_MS);
			// Register this socket as the presence activity sender so the presence store
			// can route heartbeats here instead of using HTTP PATCH /api/presence.
			presence.setActivitySender(() => send({ type: 'activity' }));
			update((s) => ({ ...s, status: 'connected', error: null }));
		});

		ws.addEventListener('message', (event) => {
			try {
				const msg: ServerMessage = JSON.parse(event.data as string);
				handleMessage(msg);
			} catch {
				console.error('Failed to parse server message', event.data);
			}
		});

		ws.addEventListener('close', (event) => {
			clearHeartbeat();
			presence.setActivitySender(null);
			update((s) => ({ ...s, status: 'disconnected' }));
			// 4401 is a custom close code used by the server when a connected user's
			// allowlist access has been revoked.
			if (event.code === ACCESS_REVOKED_CLOSE_CODE) {
				clearReconnect();
				currentGameId = null;
				window.location.href = '/auth/denied';
				return;
			}
			if (!event.wasClean && currentGameId) {
				// The original token is single-use (marked used on first connect), so
				// we must fetch a fresh token before each reconnect attempt.
				const gameIdAtClose = currentGameId;
				reconnectTimer = setTimeout(() => {
					if (!currentGameId) return;
					fetch(`/api/game/${gameIdAtClose}/ws-token`)
						.then((res) => (res.ok ? (res.json() as Promise<{ token: string }>) : null))
						.then((data) => {
							if (data?.token && currentGameId === gameIdAtClose) {
								connect(gameIdAtClose, data.token);
							}
						})
						.catch(() => {
							// Network error – will not reconnect; user can refresh the page.
						});
				}, 3000);
			}
		});

		ws.addEventListener('error', () => {
			presence.setActivitySender(null);
			update((s) => ({ ...s, status: 'error', error: 'Connection error' }));
		});
	}

	function handleMessage(msg: ServerMessage) {
		switch (msg.type) {
			case 'game_state': {
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

				update((s) => ({ ...s, state: msg.state }));
				break;
			}
			case 'error':
				update((s) => ({ ...s, error: msg.message }));
				break;
			case 'pong':
				break;
			default:
				// All other messages trigger a state refresh (server sends updated state)
				break;
		}
	}

	function send(msg: ClientMessage) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		}
	}

	function disconnect() {
		clearReconnect();
		clearHeartbeat();
		prevPlayers = null;
		currentGameId = null;
		ws?.close();
		ws = null;
		set({ state: null, status: 'disconnected', error: null });
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
