import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_LOCALE, isSupportedLocale } from '$lib/i18n/locales';

const SESSION_COOKIE = 'pref_session';
const LOCALE_COOKIE = 'pref_locale';
const SESSION_DURATION_DAYS = 30;

interface GoogleTokenResponse {
	access_token: string;
	id_token: string;
	token_type: string;
}

interface GoogleUserInfo {
	sub: string;
	name: string;
	email: string;
	picture: string;
}

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const oauthError = url.searchParams.get('error');
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('oauth_state');

	// Clear the state cookie immediately
	cookies.delete('oauth_state', { path: '/' });

	// Google denied access (e.g. user not in the allowed list)
	if (oauthError === 'access_denied') {
		redirect(303, '/auth/denied');
	}

	if (oauthError) {
		error(400, 'Authentication failed');
	}

	if (!code || !state || state !== storedState) {
		error(400, 'Invalid OAuth state or missing code');
	}

	if (!platform?.env) {
		error(500, 'Server configuration error');
	}

	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DB } = platform.env;
	if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
		error(500, 'Missing Google OAuth secrets');
	}
	const localeCookie = cookies.get(LOCALE_COOKIE);
	const preferredLocale = isSupportedLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;
	const redirectUri = `${url.origin}/auth/callback`;

	// Exchange code for tokens
	const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: GOOGLE_CLIENT_ID,
			client_secret: GOOGLE_CLIENT_SECRET,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});

	if (!tokenRes.ok) {
		error(502, 'Failed to exchange OAuth code');
	}

	const tokens: GoogleTokenResponse = await tokenRes.json();

	// Get user info from Google
	const authHeader = 'Bearer ' + tokens.access_token;
	const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
		headers: { Authorization: authHeader }
	});

	if (!userRes.ok) {
		error(502, 'Failed to fetch user info from Google');
	}

	const googleUser: GoogleUserInfo = await userRes.json();

	// Upsert user in D1
	const userId = `google_${googleUser.sub}`;
	await DB.prepare(
		`INSERT INTO users (id, name, email, avatar_url, preferred_locale, created_at)
		 VALUES (?, ?, ?, ?, ?, datetime('now'))
		 ON CONFLICT(id) DO UPDATE SET
		   name = excluded.name,
		   email = excluded.email,
		   avatar_url = excluded.avatar_url`
	)
		.bind(userId, googleUser.name, googleUser.email, googleUser.picture ?? null, preferredLocale)
		.run();

	// Create session
	const sessionToken = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

	await DB.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
		.bind(sessionToken, userId, expiresAt.toISOString().replace('T', ' ').slice(0, 19))
		.run();

	cookies.set(SESSION_COOKIE, sessionToken, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60
	});
	cookies.set(LOCALE_COOKIE, preferredLocale, {
		path: '/',
		httpOnly: false,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 365 * 24 * 60 * 60
	});

	redirect(303, '/');
};
