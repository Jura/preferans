/**
 * Preferans Worker – Durable Object host only.
 * All API routing is handled by the SvelteKit Pages application.
 * This worker exists solely to host the GameRoom and LobbyRoom Durable Object classes.
 */

export { GameRoom } from './durable-objects/GameRoom';
export { LobbyRoom } from './durable-objects/LobbyRoom';

export interface Env {
	DB: D1Database;
	GAME_ROOM: DurableObjectNamespace;
	LOBBY_ROOM: DurableObjectNamespace;
}

export default {
	async fetch(_request: Request, _env: Env): Promise<Response> {
		return new Response('Not found', { status: 404 });
	}
};
