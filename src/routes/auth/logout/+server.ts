import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SESSION_COOKIE = 'pref_session';

export const POST: RequestHandler = async ({ cookies, platform }) => {
	const sessionToken = cookies.get(SESSION_COOKIE);

	if (sessionToken && platform?.env?.DB) {
		// Retrieve the user ID before deleting the session so we can clear presence
		const session = await platform.env.DB.prepare(`SELECT user_id FROM sessions WHERE token = ?`)
			.bind(sessionToken)
			.first<{ user_id: string }>();

		await platform.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(sessionToken).run();

		if (session?.user_id) {
			// Clear last_active_at so the user immediately appears offline
			await platform.env.DB.prepare(`UPDATE users SET last_active_at = NULL WHERE id = ?`)
				.bind(session.user_id)
				.run();

			// Notify LobbyRoom to push an immediate presence update to all connected clients
			const lobbyRoom = platform.env.LOBBY_ROOM;
			if (lobbyRoom) {
				try {
					const doId = lobbyRoom.idFromName('global');
					const stub = lobbyRoom.get(doId);
					await stub.fetch(new Request('http://lobby/notify', { method: 'POST' }));
				} catch {
					// Notification failed – lobby clients will see the update on the next poll interval
				}
			}
		}
	}

	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/');
};
