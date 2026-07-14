import i18n, { type Config } from 'sveltekit-i18n';

const config: Config<Record<string, unknown>> = {
	loaders: [
		{
			locale: 'en',
			key: 'app',
			loader: async () => (await import('./translations/en.json')).default.app
		},
		{
			locale: 'ru',
			key: 'app',
			loader: async () => (await import('./translations/ru.json')).default.app
		},
		{
			locale: 'uk',
			key: 'app',
			loader: async () => (await import('./translations/uk.json')).default.app
		}
	]
};

export const { t, locale, locales, loading, loadTranslations } = new i18n(config);
