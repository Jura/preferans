import { writable, derived } from 'svelte/store';
import type { GameState, ClientMessage, ServerMessage } from '$lib/types/preferans';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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
	let currentGameId: string | null = null;
	let currentToken: string | null = null;

	function clearReconnect() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function connect(gameId: string, token: string) {
		currentGameId = gameId;
		currentToken = token;
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
			update((s) => ({ ...s, status: 'disconnected' }));
			if (!event.wasClean && currentGameId) {
				// Reconnect after 3 seconds
				reconnectTimer = setTimeout(() => {
					if (currentGameId && currentToken) {
						connect(currentGameId, currentToken);
					}
				}, 3000);
			}
		});

		ws.addEventListener('error', () => {
			update((s) => ({ ...s, status: 'error', error: 'Ошибка соединения' }));
		});
	}

	function handleMessage(msg: ServerMessage) {
		switch (msg.type) {
			case 'game_state':
				update((s) => ({ ...s, state: msg.state }));
				break;
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
		currentGameId = null;
		currentToken = null;
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
