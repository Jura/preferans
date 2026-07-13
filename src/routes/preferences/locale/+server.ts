import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupportedLocale } from '$lib/i18n/locales';
import en from '$lib/i18n/translations/en.json';
import ru from '$lib/i18n/translations/ru.json';
import uk from '$lib/i18n/translations/uk.json';

const LOCALE_COOKIE = 'pref_locale';
const UNSUPPORTED_LOCALE_MESSAGES = {
	en: en.app.errors.unsupportedLocale,
	ru: ru.app.errors.unsupportedLocale,
	uk: uk.app.errors.unsupportedLocale
} as const;
const LOCALE_UPDATE_FAILED_MESSAGES = {
	en: en.app.errors.localeUpdateFailed,
	ru: ru.app.errors.localeUpdateFailed,
	uk: uk.app.errors.localeUpdateFailed
} as const;

function safeRedirectPath(referer: string | null, currentUrl: URL): string {
	if (!referer) return '/';

	try {
		const parsed = new URL(referer, currentUrl);
		if (parsed.origin === currentUrl.origin) {
			return `${parsed.pathname}${parsed.search}${parsed.hash}`;
		}
	} catch {
		// Ignore malformed referer and use root path.
	}

	return '/';
}

export const POST: RequestHandler = async ({ request, locals, cookies, platform, url }) => {
	const redirectPath = safeRedirectPath(request.headers.get('referer'), url);
	const formData = await request.formData();
	const localeValue = formData.get('locale');
	const locale = typeof localeValue === 'string' ? localeValue : null;
	const activeLocale = isSupportedLocale(locals.locale) ? locals.locale : 'en';

	if (!isSupportedLocale(locale)) {
		error(400, UNSUPPORTED_LOCALE_MESSAGES[activeLocale]);
	}

	cookies.set(LOCALE_COOKIE, locale, {
		path: '/',
		httpOnly: false,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 365 * 24 * 60 * 60
	});

	if (locals.user && platform?.env?.DB) {
		try {
			await platform.env.DB.prepare(`UPDATE users SET preferred_locale = ? WHERE id = ?`)
				.bind(locale, locals.user.id)
				.run();
		} catch {
			error(500, LOCALE_UPDATE_FAILED_MESSAGES[activeLocale]);
		}
	}

	redirect(303, redirectPath);
};
