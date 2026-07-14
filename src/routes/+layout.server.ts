import type { LayoutServerLoad } from './$types';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '$lib/i18n/locales';

export const load: LayoutServerLoad = async ({ locals, platform }) => {
	let lobbyToken: string | null = null;

	// Issue a short-lived lobby WebSocket token for authenticated users.
	// This enables the client to connect to LobbyRoom for real-time lobby updates.
	if (locals.user && platform?.env?.DB) {
		lobbyToken = crypto.randomUUID();
		await platform.env.DB.prepare(
			`INSERT INTO ws_tokens (token, user_id, game_id, expires_at)
			 VALUES (?, ?, NULL, datetime('now', '+5 minutes'))`
		)
			.bind(lobbyToken, locals.user.id)
			.run();
	}

	return {
		user: locals.user,
		locale: locals.locale ?? DEFAULT_LOCALE,
		locales: SUPPORTED_LOCALES,
		lobbyToken
	};
};
