import { type Handle } from '@sveltejs/kit';
import { DEFAULT_LOCALE, isSupportedLocale } from '$lib/i18n/locales';
import {
	cleanupInactiveDummyUsers,
	isDummySessionToken,
	isDummyUserId,
	isTestLoginEnabled
} from '$lib/server/test-login';
import { getUserRole } from '$lib/server/user-access';

const SESSION_COOKIE = 'pref_session';
const LOCALE_COOKIE = 'pref_locale';

export const handle: Handle = async ({ event, resolve }) => {
	// Read session token from cookie
	const sessionToken = event.cookies.get(SESSION_COOKIE);
	const cookieLocale = event.cookies.get(LOCALE_COOKIE);
	event.locals.locale = isSupportedLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

	if (sessionToken && event.platform?.env?.DB) {
		try {
			// Look up session in D1
			const result = await event.platform.env.DB.prepare(
				`SELECT s.token, s.expires_at,
				        u.id, u.name, u.email, u.avatar_url, u.preferred_locale,
				        EXISTS(
				        	SELECT 1
				        	FROM user_allowlist a
				        	WHERE a.email = LOWER(u.email)
				        ) AS is_allowed
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
					preferred_locale: string | null;
					is_allowed: number;
				}>();

			if (result) {
				const role = getUserRole(result.email, event.platform.env.ADMIN_EMAIL);
				const isDummyUser = isDummyUserId(result.id);
				if (
					(isDummyUser && !isTestLoginEnabled(event.url)) ||
					(role !== 'admin' && !isDummyUser && !result.is_allowed)
				) {
					await event.platform.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`)
						.bind(sessionToken)
						.run();
					if (isDummyUser) {
						await cleanupInactiveDummyUsers(event.platform.env.DB);
					}
					event.cookies.delete(SESSION_COOKIE, { path: '/' });
					event.locals.user = null;
					return resolve(event);
				}

				const preferredLocale = isSupportedLocale(result.preferred_locale)
					? result.preferred_locale
					: event.locals.locale;

				await event.platform.env.DB.prepare(
					`UPDATE users
					 SET last_active_at = datetime('now')
					 WHERE id = ?
					   AND (
					   	last_active_at IS NULL
					   	OR last_active_at < datetime('now', '-1 minute')
					   )`
				)
					.bind(result.id)
					.run();

				event.locals.user = {
					id: result.id,
					name: result.name,
					email: result.email,
					avatarUrl: result.avatar_url,
					preferredLocale,
					role
				};
				event.locals.locale = preferredLocale;

				if (cookieLocale !== preferredLocale) {
					event.cookies.set(LOCALE_COOKIE, preferredLocale, {
						path: '/',
						httpOnly: false,
						secure: event.url.protocol === 'https:',
						sameSite: 'lax',
						maxAge: 365 * 24 * 60 * 60
					});
				}
			} else {
				// Expired or invalid session - clear cookie
				if (isDummySessionToken(sessionToken)) {
					const expiredSession = await event.platform.env.DB.prepare(
						`SELECT user_id FROM sessions WHERE token = ?`
					)
						.bind(sessionToken)
						.first<{ user_id: string }>();
					if (expiredSession?.user_id && isDummyUserId(expiredSession.user_id)) {
						await cleanupInactiveDummyUsers(event.platform.env.DB);
					}
				}
				event.cookies.delete(SESSION_COOKIE, { path: '/' });
				event.locals.user = null;
			}
		} catch {
			event.locals.user = null;
		}
	} else {
		event.locals.user = null;
	}

	return resolve(event);
};
