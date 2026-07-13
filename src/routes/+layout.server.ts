import type { LayoutServerLoad } from './$types';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '$lib/i18n/locales';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		locale: locals.locale ?? DEFAULT_LOCALE,
		locales: SUPPORTED_LOCALES
	};
};
