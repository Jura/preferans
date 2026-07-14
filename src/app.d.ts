// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { D1Database } from '@cloudflare/workers-types';
import type { SupportedLocale } from '$lib/i18n/locales';

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			user: {
				id: string;
				name: string;
				email: string;
				avatarUrl: string | null;
				preferredLocale: SupportedLocale;
				role: 'admin' | 'player';
			} | null;
			locale: SupportedLocale;
		}
		interface PageData {
			user?: App.Locals['user'];
			locale?: SupportedLocale;
		}
		interface Platform {
			env: {
				DB: D1Database;
				GOOGLE_CLIENT_ID: string;
				GOOGLE_CLIENT_SECRET: string;
				SESSION_SECRET: string;
				OAUTH_REDIRECT_DOMAIN?: string;
				ADMIN_EMAIL?: string;
				GAME_ROOM: DurableObjectNamespace;
				LOBBY_ROOM: DurableObjectNamespace;
			};
			context: {
				waitUntil(promise: Promise<unknown>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
