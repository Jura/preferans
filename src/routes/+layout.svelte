<script lang="ts">
	import { auth } from '$lib/stores/auth';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Sync server-side user into the client store
	$effect(() => {
		if (data.user) {
			auth.login(data.user);
		}
	});
</script>

<svelte:head>
	<meta name="theme-color" content="#1b4332" />
</svelte:head>

<div class="app">
	<header>
		<a href="/" class="logo" aria-label="Главная">
			<span class="logo-icon">🃏</span>
			<span class="logo-text">Преферанс</span>
		</a>

		<nav>
			{#if data.user}
				<span class="user-info">
					{#if data.user.avatarUrl}
						<img
							src={data.user.avatarUrl}
							alt={data.user.name}
							class="avatar"
							width="32"
							height="32"
						/>
					{/if}
					<span class="user-name">{data.user.name}</span>
				</span>
				<button class="btn-outline" onclick={() => auth.logout()}>Выйти</button>
			{:else}
				<a href="/auth/login" class="btn-primary">Войти</a>
			{/if}
		</nav>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<p>Преферанс онлайн — классическая русская карточная игра</p>
	</footer>
</div>

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

	.logo-icon {
		font-size: 28px;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.avatar {
		border-radius: 50%;
		border: 2px solid #c8a96e;
	}

	.user-name {
		font-size: 14px;
		color: #f0e6d3;
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
</style>
