const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
