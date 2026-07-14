import i18n, { type Config } from 'sveltekit-i18n';

const config: Config<Record<string, unknown>> = {
	loaders: [
		{
			locale: 'en',
			loader: async () => (await import('./translations/en.json')).default
		},
		{
			locale: 'ru',
			loader: async () => (await import('./translations/ru.json')).default
		},
		{
			locale: 'uk',
			loader: async () => (await import('./translations/uk.json')).default
		}
	]
};

export const { t, locale, locales, loading, loadTranslations } = new i18n(config);
