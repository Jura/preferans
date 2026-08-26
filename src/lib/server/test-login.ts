const TEST_LOGIN_HOST_SUFFIX = 'preferans-6bq.pages.dev';

export const DUMMY_ACCOUNTS = [
	{
		id: 'dummy_north',
		name: 'Dummy North',
		email: 'dummy-north@example.invalid'
	},
	{
		id: 'dummy_east',
		name: 'Dummy East',
		email: 'dummy-east@example.invalid'
	},
	{
		id: 'dummy_south',
		name: 'Dummy South',
		email: 'dummy-south@example.invalid'
	}
] as const;

export function isTestLoginHost(hostname: string): boolean {
	return hostname === TEST_LOGIN_HOST_SUFFIX || hostname.endsWith(`.${TEST_LOGIN_HOST_SUFFIX}`);
}

export function isTestLoginEnabled(url: URL): boolean {
	return isTestLoginHost(url.hostname);
}

export function isTestLoginConfigured(env?: App.Platform['env']): boolean {
	return Boolean(env?.TEST_LOGIN_SECRET);
}

export function getDummyAccount(dummyId: string) {
	return DUMMY_ACCOUNTS.find((account) => account.id === dummyId) ?? null;
}
