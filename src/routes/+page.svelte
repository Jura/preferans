<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

</script>

<svelte:head>
	<title>{$t('app.lobby.title')}</title>
</svelte:head>

<div class="lobby">
	<div class="hero">
		<h1 class="hero-title">{$t('app.lobby.heroTitle')}</h1>
		<p class="hero-subtitle">{$t('app.lobby.heroSubtitle')}</p>

		{#if data.user}
			<form method="POST" action="?/createGame" use:enhance>
				<button type="submit" class="btn-create">{$t('app.lobby.createGame')}</button>
			</form>
		{:else}
			<a href="/auth/login" class="btn-create">{$t('app.lobby.signInAndPlay')}</a>
		{/if}
	</div>

	<section class="games-section">
		<h2>{$t('app.lobby.openGames')}</h2>

		{#if data.games.length === 0}
			<div class="empty-games">
				<span class="empty-icon">🎴</span>
				<p>{$t('app.lobby.emptyGames')}</p>
			</div>
		{:else}
			<ul class="games-list" aria-label={$t('app.lobby.gamesListAria')}>
				{#each data.games as game}
					<li class="game-card">
						<div class="game-info">
							<span class="game-host">{game.host_name}</span>
							<span class="game-players">{$t('app.lobby.playersCount', { count: game.player_count })}</span>
							<span class="game-phase badge">{$t(`app.phase.${game.phase}`)}</span>
						</div>
						<a
							href="/game/{game.id}"
							class="btn-join"
							aria-label={$t('app.lobby.joinGameAria', { hostName: game.host_name })}
						>
							{game.player_count < 3 ? $t('app.lobby.join') : $t('app.lobby.watch')}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="rules-section">
		<h2>{$t('app.lobby.rules')}</h2>
		<div class="rules-grid">
			<div class="rule-card">
				<h3>{$t('app.lobby.ruleGoalTitle')}</h3>
				<p>{$t('app.lobby.ruleGoalText')}</p>
			</div>
			<div class="rule-card">
				<h3>{$t('app.lobby.ruleDeckTitle')}</h3>
				<p>{$t('app.lobby.ruleDeckText')}</p>
			</div>
			<div class="rule-card">
				<h3>{$t('app.lobby.ruleBiddingTitle')}</h3>
				<p>{$t('app.lobby.ruleBiddingText')}</p>
			</div>
			<div class="rule-card">
				<h3>{$t('app.lobby.ruleScoringTitle')}</h3>
				<p>{$t('app.lobby.ruleScoringText')}</p>
			</div>
		</div>
	</section>
</div>

<style>
	.lobby {
		max-width: 960px;
		margin: 0 auto;
	}

	.hero {
		text-align: center;
		padding: 48px 24px;
	}

	.hero-title {
		font-size: clamp(32px, 5vw, 56px);
		margin: 0 0 12px;
		color: #ffd700;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
	}

	.hero-subtitle {
		font-size: 18px;
		color: #c8a96e;
		margin: 0 0 32px;
	}

	.btn-create {
		display: inline-block;
		background: linear-gradient(135deg, #c8a96e, #e0c088);
		color: #1a1a2e;
		padding: 14px 36px;
		border-radius: 8px;
		font-size: 18px;
		font-weight: bold;
		border: none;
		cursor: pointer;
		text-decoration: none;
		transition: transform 0.15s, box-shadow 0.15s;
		box-shadow: 0 4px 16px rgba(200, 169, 110, 0.3);
	}

	.btn-create:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(200, 169, 110, 0.5);
		text-decoration: none;
	}

	.games-section,
	.rules-section {
		margin-bottom: 48px;
	}

	h2 {
		font-size: 22px;
		color: #c8a96e;
		border-bottom: 1px solid rgba(200, 169, 110, 0.3);
		padding-bottom: 8px;
		margin-bottom: 16px;
	}

	.empty-games {
		text-align: center;
		padding: 48px;
		color: #666;
	}

	.empty-icon {
		font-size: 48px;
		display: block;
		margin-bottom: 12px;
	}

	.games-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.game-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(200, 169, 110, 0.2);
		border-radius: 8px;
		padding: 12px 16px;
		transition: background 0.15s;
	}

	.game-card:hover {
		background: rgba(255, 255, 255, 0.07);
	}

	.game-info {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.game-host {
		font-weight: bold;
	}

	.game-players {
		font-size: 13px;
		color: #888;
	}

	.badge {
		font-size: 12px;
		background: rgba(200, 169, 110, 0.15);
		color: #c8a96e;
		padding: 2px 8px;
		border-radius: 12px;
	}

	.btn-join {
		background: rgba(200, 169, 110, 0.15);
		color: #c8a96e;
		padding: 6px 16px;
		border-radius: 6px;
		font-size: 14px;
		white-space: nowrap;
		transition: background 0.15s;
	}

	.btn-join:hover {
		background: rgba(200, 169, 110, 0.3);
		text-decoration: none;
	}

	.rules-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.rule-card {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(200, 169, 110, 0.15);
		border-radius: 8px;
		padding: 16px;
	}

	.rule-card h3 {
		margin: 0 0 8px;
		font-size: 16px;
		color: #ffd700;
	}

	.rule-card p {
		margin: 0;
		font-size: 14px;
		color: #c0b090;
		line-height: 1.5;
	}
</style>
