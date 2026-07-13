import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SESSION_COOKIE = 'pref_session';

export const POST: RequestHandler = async ({ cookies, platform }) => {
	const sessionToken = cookies.get(SESSION_COOKIE);

	if (sessionToken && platform?.env?.DB) {
		await platform.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`)
			.bind(sessionToken)
			.run();
	}

	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/');
};
