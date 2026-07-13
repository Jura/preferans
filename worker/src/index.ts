/**
 * Preferans Worker – main entry point
 * Handles REST API routes and routes WebSocket connections to Durable Objects.
 */

export { GameRoom } from './durable-objects/GameRoom';

export interface Env {
	DB: D1Database;
	GAME_ROOM: DurableObjectNamespace;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// CORS preflight
		if (request.method === 'OPTIONS') {
			return corsResponse(new Response(null, { status: 204 }));
		}

		// Route: WebSocket upgrade for game room
		// GET /api/game/:id/ws?token=...
		const wsMatch = url.pathname.match(/^\/api\/game\/([^/]+)\/ws$/);
		if (wsMatch) {
			const gameId = wsMatch[1];
			return handleGameWebSocket(request, env, gameId, url);
		}

		// Route: list active games
		if (url.pathname === '/api/games' && request.method === 'GET') {
			return handleListGames(env);
		}

		// Route: create a new game (requires auth)
		if (url.pathname === '/api/games' && request.method === 'POST') {
			return handleCreateGame(request, env);
		}

		// Route: get game info
		const gameMatch = url.pathname.match(/^\/api\/game\/([^/]+)$/);
		if (gameMatch && request.method === 'GET') {
			return handleGetGame(env, gameMatch[1]);
		}

		return corsResponse(new Response('Not found', { status: 404 }));
	}
};

// ─── WebSocket routing ────────────────────────────────────────────────────────

async function handleGameWebSocket(
	request: Request,
	env: Env,
	gameId: string,
	url: URL
): Promise<Response> {
	// Verify the game exists before connecting
	const game = await env.DB.prepare(`SELECT id FROM games WHERE id = ?`)
		.bind(gameId)
		.first<{ id: string }>();

	if (!game) {
		return corsResponse(new Response('Game not found', { status: 404 }));
	}

	// Route to Durable Object (one instance per game)
	const id = env.GAME_ROOM.idFromName(gameId);
	const stub = env.GAME_ROOM.get(id);

	// Forward to Durable Object with gameId in query string
	const doUrl = new URL(request.url);
	doUrl.searchParams.set('gameId', gameId);
	const doRequest = new Request(doUrl.toString(), request);

	return stub.fetch(doRequest);
}

// ─── REST handlers ────────────────────────────────────────────────────────────

async function handleListGames(env: Env): Promise<Response> {
	const result = await env.DB.prepare(
		`SELECT g.id, g.phase, g.created_at,
		        u.name AS host_name,
		        COALESCE(COUNT(gp.player_id), 0) AS player_count
		 FROM games g
		 JOIN users u ON u.id = g.host_id
		 LEFT JOIN game_players gp ON gp.game_id = g.id
		 WHERE g.phase IN ('waiting', 'dealing', 'bidding', 'playing')
		 GROUP BY g.id
		 ORDER BY g.created_at DESC
		 LIMIT 20`
	).all();

	return corsResponse(Response.json(result.results));
}

async function handleCreateGame(request: Request, env: Env): Promise<Response> {
	// Validate session cookie
	const user = await getUserFromRequest(request, env);
	if (!user) {
		return corsResponse(new Response('Unauthorized', { status: 401 }));
	}

	const gameId = crypto.randomUUID();
	await env.DB.prepare(
		`INSERT INTO games (id, host_id, phase, created_at) VALUES (?, ?, 'waiting', datetime('now'))`
	)
		.bind(gameId, user.id)
		.run();

	await env.DB.prepare(
		`INSERT INTO game_players (game_id, player_id, position) VALUES (?, ?, 0)`
	)
		.bind(gameId, user.id)
		.run();

	return corsResponse(Response.json({ gameId }));
}

async function handleGetGame(env: Env, gameId: string): Promise<Response> {
	const game = await env.DB.prepare(
		`SELECT g.id, g.phase, g.created_at,
		        u.name AS host_name
		 FROM games g
		 JOIN users u ON u.id = g.host_id
		 WHERE g.id = ?`
	)
		.bind(gameId)
		.first();

	if (!game) {
		return corsResponse(new Response('Not found', { status: 404 }));
	}

	const players = await env.DB.prepare(
		`SELECT gp.position, u.id, u.name, u.avatar_url
		 FROM game_players gp JOIN users u ON u.id = gp.player_id
		 WHERE gp.game_id = ? ORDER BY gp.position`
	)
		.bind(gameId)
		.all();

	return corsResponse(Response.json({ ...game, players: players.results }));
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getUserFromRequest(
	request: Request,
	env: Env
): Promise<{ id: string; name: string } | null> {
	const cookieHeader = request.headers.get('Cookie') ?? '';
	const sessionToken = cookieHeader
		.split(';')
		.map((c) => c.trim())
		.find((c) => c.startsWith('pref_session='))
		?.slice('pref_session='.length);

	if (!sessionToken) return null;

	const result = await env.DB.prepare(
		`SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token = ? AND s.expires_at > datetime('now')`
	)
		.bind(sessionToken)
		.first<{ id: string; name: string }>();

	return result ?? null;
}

// ─── CORS helper ──────────────────────────────────────────────────────────────

function corsResponse(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set('Access-Control-Allow-Origin', '*');
	headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
