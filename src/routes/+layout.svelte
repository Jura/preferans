<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { auth } from '$lib/stores/auth';
	import { presence } from '$lib/stores/presence';
	import { lobby } from '$lib/stores/lobby';
	import Toast from '$lib/components/Toast.svelte';
	import { t } from '$lib/i18n';
	import packageJson from '../../package.json';
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

	function avatarInitial(name: string): string {
		const trimmed = name.trim();
		if (!trimmed) return '?';
		const first = Array.from(trimmed)[0];
		return /\p{L}/u.test(first) ? first.toUpperCase() : '?';
	}

	const appVersion = packageJson.version;
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
								>{avatarInitial(data.user.name)}</span
							>
						{/if}
					</summary>
					<div class="menu-panel">
						<div class="menu-section">
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
		<p>{$t('app.footerTagline')} · v{appVersion}</p>
	</footer>
</div>

<!-- Global toast notification area -->
<Toast />

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-5);
		background: var(--surface-2);
		border-bottom: 1px solid var(--border-gold-soft);
		position: sticky;
		top: 0;
		z-index: 100;
		backdrop-filter: blur(8px);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--cream-200);
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: bold;
		letter-spacing: 0.02em;
		text-decoration: none;
	}

	.logo:hover {
		color: var(--gold-300);
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
		border: 1px solid var(--border-gold-soft);
		border-radius: var(--radius-sm);
		color: var(--cream-200);
		padding: 6px 8px;
		font-size: var(--text-base);
		transition: border-color var(--dur-fast) var(--ease-out);
	}

	select:hover {
		border-color: var(--border-gold);
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
		border: 2px solid var(--gold-500);
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.08);
		color: var(--cream-200);
		font-size: var(--text-base);
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
		background: var(--surface-menu);
		border: 1px solid var(--border-gold);
		border-radius: var(--radius-md);
		padding: 10px;
		z-index: 200;
		box-shadow: var(--shadow-lg);
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
		border-top: 1px solid var(--border-gold-soft);
		padding-top: 8px;
	}

	.btn-primary {
		background: linear-gradient(180deg, var(--gold-400), var(--gold-500));
		color: var(--ink-800);
		padding: 8px 18px;
		border-radius: var(--radius-sm);
		font-weight: bold;
		text-decoration: none;
		font-size: var(--text-base);
		transition:
			filter var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}

	.btn-primary:hover {
		filter: brightness(1.1);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
	}

	.btn-outline {
		background: transparent;
		color: var(--gold-400);
		padding: 6px 14px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--gold-500);
		font-size: var(--text-base);
		cursor: pointer;
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}

	.btn-outline:hover {
		background: rgba(200, 169, 110, 0.15);
		color: var(--gold-300);
	}

	main {
		flex: 1;
		padding: 24px;
	}

	footer {
		padding: var(--space-4) var(--space-5);
		text-align: center;
		font-size: var(--text-sm);
		color: var(--muted);
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	@media (max-width: 640px) {
		header {
			padding: 10px 12px;
		}

		.logo-text {
			font-size: var(--text-lg);
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
