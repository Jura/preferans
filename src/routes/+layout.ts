import type { LayoutLoad } from './$types';
import { loadTranslations } from '$lib/i18n';
import { DEFAULT_LOCALE } from '$lib/i18n/locales';

export const load: LayoutLoad = async ({ data, url }) => {
	await loadTranslations(data.locale ?? DEFAULT_LOCALE, url.pathname);
	return data;
};
