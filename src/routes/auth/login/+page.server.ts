import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { DEFAULT_LOCALE, isSupportedLocale } from '$lib/i18n/locales';
import en from '$lib/i18n/translations/en.json';
import ru from '$lib/i18n/translations/ru.json';
import uk from '$lib/i18n/translations/uk.json';
import { DUMMY_ACCOUNTS, getDummyAccount, isTestLoginEnabled } from '$lib/server/test-login';

const SESSION_COOKIE = 'pref_session';
const LOCALE_COOKIE = 'pref_locale';
const SESSION_DURATION_DAYS = 30;

const LOGIN_MESSAGES = {
	en: en.app.login,
	ru: ru.app.login,
	uk: uk.app.login
} as const;

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (locals.user) {
		redirect(303, '/');
	}

	return {
		dummyAccounts: DUMMY_ACCOUNTS.map(({ id, name }) => ({ id, name })),
		dummyLoginEnabled: isTestLoginEnabled(url, platform?.env)
	};
};

export const actions: Actions = {
	dummyLogin: async ({ cookies, platform, request, url }) => {
		if (!isTestLoginEnabled(url, platform?.env)) {
			error(404, 'Not found');
		}

		if (!platform?.env?.DB || !platform.env.TEST_LOGIN_SECRET) {
			error(500, 'Server configuration error');
		}

		const formData = await request.formData();
		const localeCookie = cookies.get(LOCALE_COOKIE);
		const preferredLocale = isSupportedLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;
		const messages = LOGIN_MESSAGES[preferredLocale];

		const accessCode = formData.get('accessCode');
		if (typeof accessCode !== 'string' || accessCode !== platform.env.TEST_LOGIN_SECRET) {
			return fail(403, { dummyLoginError: messages.dummy.invalidCode });
		}

		const dummyId = formData.get('dummyId');
		if (typeof dummyId !== 'string') {
			return fail(400, { dummyLoginError: messages.dummy.invalidPlayer });
		}

		const dummyAccount = getDummyAccount(dummyId);
		if (!dummyAccount) {
			return fail(400, { dummyLoginError: messages.dummy.invalidPlayer });
		}

		const existingSessionToken = cookies.get(SESSION_COOKIE);
		if (existingSessionToken) {
			await platform.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`)
				.bind(existingSessionToken)
				.run();
		}

		await platform.env.DB.batch([
			platform.env.DB.prepare(
				`INSERT INTO user_allowlist (email, created_at)
				 VALUES (?, datetime('now'))
				 ON CONFLICT(email) DO NOTHING`
			).bind(dummyAccount.email),
			platform.env.DB.prepare(
				`INSERT INTO users (id, name, email, avatar_url, preferred_locale, created_at)
				 VALUES (?, ?, ?, NULL, ?, datetime('now'))
				 ON CONFLICT(id) DO UPDATE SET
				   name = excluded.name,
				   email = excluded.email,
				   preferred_locale = excluded.preferred_locale`
			).bind(dummyAccount.id, dummyAccount.name, dummyAccount.email, preferredLocale),
			platform.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(dummyAccount.id)
		]);

		const sessionToken = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

		await platform.env.DB.prepare(
			`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
		)
			.bind(sessionToken, dummyAccount.id, expiresAt.toISOString().replace('T', ' ').slice(0, 19))
			.run();

		cookies.set(SESSION_COOKIE, sessionToken, {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60
		});
		cookies.set(LOCALE_COOKIE, preferredLocale, {
			path: '/',
			httpOnly: false,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: 365 * 24 * 60 * 60
		});

		redirect(303, '/');
	}
};
