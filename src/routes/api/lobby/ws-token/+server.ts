import type { RequestHandler } from './$types';

/** Issues a fresh single-use token for reconnecting the authenticated lobby client. */
export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (!platform?.env?.DB) {
		return new Response('Platform not available', { status: 503 });
	}

	const token = crypto.randomUUID();
	await platform.env.DB.prepare(
		`INSERT INTO ws_tokens (token, user_id, game_id, expires_at)
		 VALUES (?, ?, NULL, datetime('now', '+5 minutes'))`
	)
		.bind(token, locals.user.id)
		.run();

	return Response.json({ token });
};
