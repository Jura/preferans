import { writable } from 'svelte/store';

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	avatarUrl: string | null;
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthUser | null>(null);

	return {
		subscribe,
		set,
		login: (user: AuthUser) => set(user),
		logout: () => {
			set(null);
			fetch('/auth/logout', { method: 'POST' }).then(() => {
				window.location.href = '/';
			});
		},
		update
	};
}

export const auth = createAuthStore();
