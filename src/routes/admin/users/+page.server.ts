import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isValidEmail, normalizeEmail } from '$lib/server/user-access';
import en from '$lib/i18n/translations/en.json';
import ru from '$lib/i18n/translations/ru.json';
import uk from '$lib/i18n/translations/uk.json';

const ADMIN_MESSAGES = {
	en: en.app.admin.messages,
	ru: ru.app.admin.messages,
	uk: uk.app.admin.messages
} as const;

type AllowlistedUser = {
	email: string;
	created_at: string;
	name: string | null;
	avatar_url: string | null;
};

function requireAdmin(locals: App.Locals, platform: App.Platform | undefined) {
	if (!locals.user || locals.user.role !== 'admin') {
		error(403, 'Forbidden');
	}

	if (!platform?.env?.DB) {
		error(500, 'Database not available');
	}

	return {
		adminEmail: platform.env.ADMIN_EMAIL ? normalizeEmail(platform.env.ADMIN_EMAIL) : null,
		DB: platform.env.DB
	};
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	const { adminEmail, DB } = requireAdmin(locals, platform);
	const { results } = await DB.prepare(
		`SELECT a.email, a.created_at, u.name, u.avatar_url
		 FROM user_allowlist a
		 LEFT JOIN users u ON LOWER(u.email) = a.email
		 ORDER BY a.email ASC`
	).all<AllowlistedUser>();
	const allowedUsers = (results as AllowlistedUser[]).filter((user) => user.email !== adminEmail);

	return {
		adminEmail,
		allowedUsers
	};
};

export const actions: Actions = {
	addUser: async ({ request, locals, platform }) => {
		const { adminEmail, DB } = requireAdmin(locals, platform);
		const messages = ADMIN_MESSAGES[locals.locale];
		const formData = await request.formData();
		const email = formData.get('email');

		if (typeof email !== 'string' || !isValidEmail(email)) {
			return fail(400, { message: messages.invalidEmail });
		}

		const normalizedEmail = normalizeEmail(email);
		if (adminEmail && normalizedEmail === adminEmail) {
			return fail(400, { message: messages.adminManaged });
		}

		await DB.prepare(
			`INSERT INTO user_allowlist (email, created_at)
			 VALUES (?, datetime('now'))
			 ON CONFLICT(email) DO NOTHING`
		)
			.bind(normalizedEmail)
			.run();

		return { message: messages.updated };
	},
	removeUser: async ({ request, locals, platform }) => {
		const { adminEmail, DB } = requireAdmin(locals, platform);
		const messages = ADMIN_MESSAGES[locals.locale];
		const formData = await request.formData();
		const email = formData.get('email');

		if (typeof email !== 'string' || !isValidEmail(email)) {
			return fail(400, { message: messages.invalidEmail });
		}

		const normalizedEmail = normalizeEmail(email);
		if (adminEmail && normalizedEmail === adminEmail) {
			return fail(400, { message: messages.adminProtected });
		}

		await DB.prepare(`DELETE FROM user_allowlist WHERE email = ?`).bind(normalizedEmail).run();
		await DB.prepare(
			`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE LOWER(email) = ?)`
		)
			.bind(normalizedEmail)
			.run();
		await DB.prepare(
			`DELETE FROM ws_tokens WHERE user_id IN (SELECT id FROM users WHERE LOWER(email) = ?)`
		)
			.bind(normalizedEmail)
			.run();

		return { message: messages.removed };
	}
};
