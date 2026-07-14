const EMAIL_PATTERN =
	/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export type UserRole = 'admin' | 'player';

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function getUserRole(email: string, adminEmail?: string | null): UserRole {
	return adminEmail && normalizeEmail(email) === normalizeEmail(adminEmail) ? 'admin' : 'player';
}

export function isValidEmail(email: string): boolean {
	return EMAIL_PATTERN.test(email.trim());
}
