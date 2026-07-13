import { type Handle } from '@sveltejs/kit';

const SESSION_COOKIE = 'pref_session';

export const handle: Handle = async ({ event, resolve }) => {
	// Read session token from cookie
	const sessionToken = event.cookies.get(SESSION_COOKIE);

	if (sessionToken && event.platform?.env?.DB) {
		try {
			// Look up session in D1
			const result = await event.platform.env.DB.prepare(
				`SELECT s.token, s.expires_at,
				        u.id, u.name, u.email, u.avatar_url
				 FROM sessions s
				 JOIN users u ON u.id = s.user_id
				 WHERE s.token = ? AND s.expires_at > datetime('now')`
			)
				.bind(sessionToken)
				.first<{
					token: string;
					expires_at: string;
					id: string;
					name: string;
					email: string;
					avatar_url: string | null;
				}>();

			if (result) {
				event.locals.user = {
					id: result.id,
					name: result.name,
					email: result.email,
					avatarUrl: result.avatar_url
				};
			} else {
				// Expired or invalid session - clear cookie
				event.cookies.delete(SESSION_COOKIE, { path: '/' });
				event.locals.user = null;
			}
		} catch {
			event.locals.user = null;
		}
	} else {
		event.locals.user = null;
	}

	const response = await resolve(event);
	return response;
};
