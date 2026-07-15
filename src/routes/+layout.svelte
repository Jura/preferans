<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { auth } from '$lib/stores/auth';
	import { presence } from '$lib/stores/presence';
	import { lobby } from '$lib/stores/lobby';
	import Toast from '$lib/components/Toast.svelte';
	import { t } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Sync server-side user into the client store
	$effect(() => {
		if (data.user) {
			auth.login(data.user);
		} else {
			auth.set(null);
		}
	});

	onMount(() => {
		if (data.user) {
			// Start tracking user activity for presence
			presence.start();
		}
	});

	// Manage the lobby WebSocket reactively based on the current route.
	// Game pages have their own socket that handles presence; the lobby socket is
	// redundant there and is disconnected to avoid keeping two sockets open at once.
	// On return to non-game routes the layout server issues a fresh token, so we
	// can reconnect here whenever $page.url changes.
	$effect(() => {
		// Destructure at the top so Svelte always tracks both `user` and `lobbyToken`
		// as reactive dependencies. If we read them conditionally (e.g. behind an early
		// return), Svelte would only track whichever branches actually ran on the last
		// execution – meaning a new lobbyToken could go unnoticed when isGamePage is true.
		const { user, lobbyToken } = data;

		if (!user) {
			lobby.disconnect();
			return;
		}

		const isGamePage = $page.url.pathname.startsWith('/game/');

		if (isGamePage) {
			lobby.disconnect();
		} else if (lobbyToken) {
			// lobby.connect() is a no-op when a connection is already open
			lobby.connect(lobbyToken);
		}
	});

	onDestroy(() => {
		presence.stop();
		lobby.disconnect();
	});
</script>

<svelte:head>
	<meta name="theme-color" content="#1b4332" />
</svelte:head>

<div class="app">
	<header>
		<a href="/" class="logo" aria-label={$t('app.homeAria')}>
			<span class="logo-text">{$t('app.name')}</span>
		</a>

		<nav>
			{#if data.user}
				<details class="user-menu">
					<summary class="menu-trigger" aria-label={data.user.name}>
						{#if data.user.avatarUrl}
							<img
								src={data.user.avatarUrl}
								alt={data.user.name}
								class="avatar"
								width="32"
								height="32"
							/>
						{:else}
							<span class="avatar-placeholder" aria-hidden="true"
								>{data.user.name[0]?.toUpperCase() ?? '?'}</span
							>
						{/if}
					</summary>
					<div class="menu-panel">
						<div class="menu-section">
							<form method="POST" action="/preferences/locale" class="locale-form">
								<label for="locale-menu" class="visually-hidden">{$t('app.language.label')}</label>
								<select
									id="locale-menu"
									name="locale"
									value={data.locale}
									onchange={(event) => event.currentTarget.form?.requestSubmit()}
								>
									{#each data.locales as localeOption}
										<option value={localeOption}>{$t(`app.language.${localeOption}`)}</option>
									{/each}
								</select>
							</form>
						</div>

						<button class="btn-outline menu-btn" onclick={() => auth.logout()}>
							{$t('app.auth.logout')}
						</button>

						{#if data.user.role === 'admin'}
							<div class="menu-section admin-section">
								<a href="/admin/users" class="btn-outline admin-link">{$t('app.admin.nav')}</a>
							</div>
						{/if}
					</div>
				</details>
			{:else}
				<form method="POST" action="/preferences/locale" class="locale-form">
					<label for="locale" class="visually-hidden">{$t('app.language.label')}</label>
					<select
						id="locale"
						name="locale"
						value={data.locale}
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
					>
						{#each data.locales as localeOption}
							<option value={localeOption}>{$t(`app.language.${localeOption}`)}</option>
						{/each}
					</select>
				</form>
				<a href="/auth/login" class="btn-primary">{$t('app.auth.login')}</a>
			{/if}
		</nav>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<p>{$t('app.footerTagline')}</p>
	</footer>
</div>

<!-- Global toast notification area -->
<Toast />

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		font-family:
			'Segoe UI',
			system-ui,
			-apple-system,
			sans-serif;
		background: #0d1f12;
		color: #f0e6d3;
		min-height: 100vh;
	}

	:global(a) {
		color: #c8a96e;
		text-decoration: none;
	}

	:global(a:hover) {
		text-decoration: underline;
	}

	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 24px;
		background: rgba(0, 0, 0, 0.5);
		border-bottom: 1px solid rgba(200, 169, 110, 0.3);
		position: sticky;
		top: 0;
		z-index: 100;
		backdrop-filter: blur(8px);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #f0e6d3;
		font-size: 20px;
		font-weight: bold;
		text-decoration: none;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.locale-form {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	select {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(200, 169, 110, 0.35);
		border-radius: 6px;
		color: #f0e6d3;
		padding: 6px 8px;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.user-menu {
		position: relative;
	}

	.menu-trigger {
		list-style: none;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.user-menu summary::-webkit-details-marker {
		display: none;
	}

	.avatar,
	.avatar-placeholder {
		border-radius: 50%;
		border: 2px solid #c8a96e;
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.08);
		color: #f0e6d3;
		font-size: 14px;
		font-weight: 700;
	}

	.menu-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		min-width: 180px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: rgba(15, 15, 30, 0.96);
		border: 1px solid rgba(200, 169, 110, 0.35);
		border-radius: 10px;
		padding: 10px;
		z-index: 200;
	}

	.menu-section {
		display: flex;
		justify-content: center;
	}

	.menu-btn,
	.admin-link {
		width: 100%;
		text-align: center;
	}

	.admin-section {
		border-top: 1px solid rgba(200, 169, 110, 0.25);
		padding-top: 8px;
	}

	.btn-primary {
		background: #c8a96e;
		color: #1a1a2e;
		padding: 8px 18px;
		border-radius: 6px;
		font-weight: bold;
		text-decoration: none;
		font-size: 14px;
		transition: background 0.15s;
	}

	.btn-primary:hover {
		background: #e0c088;
		text-decoration: none;
	}

	.btn-outline {
		background: transparent;
		color: #c8a96e;
		padding: 6px 14px;
		border-radius: 6px;
		border: 1px solid #c8a96e;
		font-size: 14px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.btn-outline:hover {
		background: rgba(200, 169, 110, 0.15);
	}

	main {
		flex: 1;
		padding: 24px;
	}

	footer {
		padding: 16px 24px;
		text-align: center;
		font-size: 13px;
		color: #666;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	@media (max-width: 640px) {
		header {
			padding: 10px 12px;
		}

		.logo-text {
			font-size: 18px;
		}

		nav {
			gap: 8px;
		}

		.btn-primary {
			padding: 6px 12px;
			font-size: 13px;
		}
	}
</style>
