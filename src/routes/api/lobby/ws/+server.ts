import type { RequestHandler } from './$types';

/**
 * GET /api/lobby/ws?token=<lobby_ws_token>
 * WebSocket endpoint for the lobby. Routes to the global LobbyRoom Durable Object.
 * The token is issued in +layout.server.ts for authenticated users.
 */
export const GET: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env) {
		return new Response('Platform not available', { status: 503 });
	}

	const { LOBBY_ROOM } = platform.env;

	if (!LOBBY_ROOM) {
		return new Response('Lobby Durable Object binding not configured', { status: 503 });
	}

	// Route to the singleton LobbyRoom Durable Object
	const doId = LOBBY_ROOM.idFromName('global');
	const stub = LOBBY_ROOM.get(doId);

	// Forward the request as-is (token is in the query string)
	return stub.fetch(request);
};
