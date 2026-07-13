export const SUPPORTED_LOCALES = ['en', 'ru', 'uk'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
	return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as SupportedLocale);
}
