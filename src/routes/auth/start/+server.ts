import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Initiate Google OAuth flow */
export const GET: RequestHandler = async ({ platform, url, cookies }) => {
	if (!platform?.env) {
		error(500, 'Server configuration error');
	}

	const clientId = platform.env.GOOGLE_CLIENT_ID;
	if (!clientId) {
		error(500, 'Missing GOOGLE_CLIENT_ID secret');
	}
	const redirectUri = `${url.origin}/auth/callback`;

	// CSRF state
	const state = crypto.randomUUID();
	cookies.set('oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 600 // 10 minutes
	});

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state,
		access_type: 'online',
		prompt: 'select_account'
	});

	redirect(303, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
