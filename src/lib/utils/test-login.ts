export const TEST_LOGIN_HOST_SUFFIX = 'preferans-6bq.pages.dev';

export function isTestLoginHost(hostname: string): boolean {
	return hostname === TEST_LOGIN_HOST_SUFFIX || hostname.endsWith(`.${TEST_LOGIN_HOST_SUFFIX}`);
}

export function isTestLoginEnabled(url: URL): boolean {
	return isTestLoginHost(url.hostname);
}
