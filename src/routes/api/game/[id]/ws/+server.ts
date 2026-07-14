import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params, platform }) => {
	if (!platform?.env) {
		return new Response('Platform not available', { status: 503 });
	}

	const { DB, GAME_ROOM } = platform.env;
	const gameId = params.id;

	// Verify the game exists before handing off to the Durable Object
	const game = await DB.prepare(`SELECT id FROM games WHERE id = ?`)
		.bind(gameId)
		.first<{ id: string }>();

	if (!game) {
		return new Response('Game not found', { status: 404 });
	}

	// Route to the Durable Object — one instance per game, keyed by gameId
	const doId = GAME_ROOM.idFromName(gameId);
	const stub = GAME_ROOM.get(doId);

	// Pass gameId as a query param so the DO knows which game it is serving
	const doUrl = new URL(request.url);
	doUrl.searchParams.set('gameId', gameId);
	const doRequest = new Request(doUrl.toString(), request);

	return stub.fetch(doRequest);
};
