import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupportedLocale } from '$lib/i18n/locales';

const LOCALE_COOKIE = 'pref_locale';

export const POST: RequestHandler = async ({ request, locals, cookies, platform, url }) => {
	const formData = await request.formData();
	const localeValue = formData.get('locale');
	const locale = typeof localeValue === 'string' ? localeValue : null;

	if (!isSupportedLocale(locale)) {
		redirect(303, request.headers.get('referer') ?? '/');
	}

	cookies.set(LOCALE_COOKIE, locale, {
		path: '/',
		httpOnly: false,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 365 * 24 * 60 * 60
	});

	if (locals.user && platform?.env?.DB) {
		await platform.env.DB.prepare(`UPDATE users SET preferred_locale = ? WHERE id = ?`)
			.bind(locale, locals.user.id)
			.run();
	}

	redirect(303, request.headers.get('referer') ?? '/');
};
