<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		BULLET_TARGET_STEP,
		DEFAULT_BULLET_TARGET,
		MAX_BULLET_TARGET,
		MIN_BULLET_TARGET
	} from '$lib/constants/game';
	import { t } from '$lib/i18n';
	import { lobby } from '$lib/stores/lobby';
	import PlayerBadge from '$lib/components/PlayerBadge.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let bulletTarget = $state(DEFAULT_BULLET_TARGET);

	// Use real-time lobby data when the WebSocket is connected; fall back to SSR data
	const games = $derived($lobby.connected ? $lobby.games : data.games);
	const usersPresence = $derived($lobby.connected ? $lobby.users : data.usersPresence);
	const isAdmin = $derived(data.user?.role === 'admin');

	const presenceStatusDot: Record<'online' | 'away' | 'offline', string> = {
		online: '🟢',
		away: '🟡',
		offline: '⚫'
	};
</script>

<svelte:head>
	<title>{$t('app.lobby.title')}</title>
</svelte:head>

<div class="lobby">
	<div class="hero">
		<h1 class="hero-title">{$t('app.lobby.heroTitle')}</h1>
		<p class="hero-subtitle">{$t('app.lobby.heroSubtitle')}</p>

		{#if data.user}
			{#if data.activeGameId}
				<div class="table-lock-card">
					<p class="table-lock-message">{$t('app.lobby.activeGameNotice')}</p>
					<a href="/game/{data.activeGameId}" class="btn-create">{$t('app.lobby.returnToGame')}</a>
				</div>
			{:else}
				<form method="POST" action="?/createGame" use:enhance class="create-game-form">
					<div class="create-game-card">
						<div class="target-header">
							<label for="bulletTarget" class="target-label"
								>{$t('app.lobby.bulletTargetLabel')}</label
							>
							<span class="target-value">{bulletTarget}</span>
						</div>
						<div class="target-controls">
							<input
								id="bulletTarget"
								name="bulletTarget"
								type="number"
								min={MIN_BULLET_TARGET}
								max={MAX_BULLET_TARGET}
								step={BULLET_TARGET_STEP}
								bind:value={bulletTarget}
								class="target-number"
							/>
							<input
								type="range"
								min={MIN_BULLET_TARGET}
								max={MAX_BULLET_TARGET}
								step={BULLET_TARGET_STEP}
								bind:value={bulletTarget}
								class="target-slider"
								aria-label={$t('app.lobby.bulletTargetLabel')}
							/>
						</div>
						<p class="target-hint">{$t('app.lobby.bulletTargetHint')}</p>
						<button type="submit" class="btn-create">{$t('app.lobby.createGame')}</button>
					</div>
				</form>
			{/if}
		{:else}
			<a href="/auth/login" class="btn-create">{$t('app.lobby.signInAndPlay')}</a>
		{/if}
	</div>

	{#if data.user}
		<section class="games-section">
			<div class="section-header">
				<h2>{$t('app.lobby.openGames')}</h2>
				<details class="users-dropdown">
					<summary>{$t('app.lobby.usersPresence')}</summary>
					<ul aria-label={$t('app.lobby.usersPresenceAria')}>
						{#each usersPresence as player}
							<li>
								<span class="presence-text">
									{presenceStatusDot[player.status]}
									<PlayerBadge playerId={player.id} name={player.name} />
									({$t(`app.lobby.presence.${player.status}`)})
								</span>
							</li>
						{/each}
					</ul>
				</details>
			</div>

			{#if games.length === 0}
				<div class="empty-games">
					<span class="empty-icon">🎴</span>
					<p>{$t('app.lobby.emptyGames')}</p>
				</div>
			{:else}
				<ul class="games-list" aria-label={$t('app.lobby.gamesListAria')}>
					{#each games as game}
						<li class="game-card" class:pinned-table={game.is_pinned === 1}>
							<div class="game-info">
								{#if game.is_pinned === 1}
									<span class="pin-badge" aria-label={$t('app.lobby.pinnedAria')}
										>📌 {$t('app.lobby.pinned')}</span
									>
								{/if}
								<span class="game-host">{game.host_name}</span>
								<span class="game-players"
									>{$t('app.lobby.playersCount', { count: game.player_count })}</span
								>
								<span
									class="badge"
									aria-label={$t('app.lobby.bulletTargetLabel') +
										': ' +
										$t('app.lobby.bulletTargetBadge', { count: game.bullet_target })}
								>
									>{$t('app.lobby.bulletTargetBadge', { count: game.bullet_target })}</span
								>
								<span class="game-phase badge">{$t(`app.phase.${game.phase}`)}</span>
								{#if game.phase === 'paused' && game.paused_until !== null}
									<span class="badge paused-until">
										{$t('app.lobby.pausedUntil', {
											time: new Date(game.paused_until).toLocaleString()
										})}
									</span>
								{/if}
							</div>
							<div class="game-actions">
								<a
									href="/game/{game.id}"
									class="btn-join"
									aria-label={$t('app.lobby.joinGameAria', { hostName: game.host_name })}
								>
									{#if data.activeGameId === game.id}
										{$t('app.lobby.returnToGame')}
									{:else}
										{game.player_count < 3 ? $t('app.lobby.join') : $t('app.lobby.watch')}
									{/if}
								</a>
								{#if isAdmin}
									<form method="POST" action="?/adminDealOut">
										<input type="hidden" name="gameId" value={game.id} />
										<button type="submit" class="btn-admin">{$t('app.lobby.dealOut')}</button>
									</form>
									<form method="POST" action="?/adminDismiss">
										<input type="hidden" name="gameId" value={game.id} />
										<button type="submit" class="btn-admin danger">{$t('app.lobby.dismiss')}</button
										>
									</form>
									<form method="POST" action="?/adminTogglePin">
										<input type="hidden" name="gameId" value={game.id} />
										<input type="hidden" name="pin" value={game.is_pinned === 1 ? '0' : '1'} />
										<button type="submit" class="btn-admin secondary">
											{game.is_pinned === 1 ? $t('app.lobby.unpin') : $t('app.lobby.pin')}
										</button>
									</form>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{:else}
		<section class="games-section">
			<h2>{$t('app.lobby.onlineUsersTitle')}</h2>
			<div class="online-users-indicator" aria-live="polite">
				<span class="dot-online" aria-hidden="true"></span>
				<p>{$t('app.lobby.onlineUsersCount', { count: data.onlineUsersCount })}</p>
			</div>
			<p class="login-prompt">{$t('app.lobby.loginPrompt')}</p>
		</section>
	{/if}

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

	.create-game-form {
		display: flex;
		justify-content: center;
	}

	.create-game-card,
	.table-lock-card {
		display: grid;
		gap: 16px;
		width: min(100%, 520px);
		padding: 20px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(200, 169, 110, 0.25);
		border-radius: 16px;
		box-shadow: 0 10px 32px rgba(0, 0, 0, 0.22);
	}

	.target-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.target-label {
		font-size: 16px;
		font-weight: 600;
		color: #f0e6d3;
	}

	.target-value {
		font-size: 28px;
		font-weight: 700;
		color: #ffd700;
	}

	.target-controls {
		display: grid;
		grid-template-columns: minmax(0, 120px) minmax(0, 1fr);
		gap: 16px;
		align-items: center;
	}

	.target-number,
	.target-slider {
		width: 100%;
	}

	.target-number {
		background: rgba(0, 0, 0, 0.28);
		border: 1px solid rgba(200, 169, 110, 0.35);
		border-radius: 10px;
		color: #f0e6d3;
		padding: 12px 14px;
		font-size: 18px;
	}

	.target-slider {
		accent-color: #c8a96e;
	}

	.target-hint,
	.table-lock-message {
		margin: 0;
		color: #c0b090;
		font-size: 14px;
		line-height: 1.5;
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
		transition:
			transform 0.15s,
			box-shadow 0.15s;
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

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.users-dropdown {
		position: relative;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(200, 169, 110, 0.25);
		border-radius: 8px;
		padding: 8px 12px;
	}

	.users-dropdown summary {
		cursor: pointer;
		color: #c8a96e;
		font-size: 14px;
	}

	.users-dropdown ul {
		list-style: none;
		padding: 8px 0 0;
		margin: 8px 0 0;
		border-top: 1px solid rgba(200, 169, 110, 0.2);
		max-height: 220px;
		overflow-y: auto;
		min-width: 220px;
	}

	.users-dropdown li + li {
		margin-top: 6px;
	}

	.presence-text {
		font-size: 13px;
		color: #d8ccb2;
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

	.online-users-indicator {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 18px;
		margin-top: 16px;
	}

	.dot-online {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #2ecc71;
		box-shadow: 0 0 8px rgba(46, 204, 113, 0.6);
	}

	.login-prompt {
		margin-top: 12px;
		color: #c0b090;
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

	.pinned-table {
		border-color: rgba(255, 215, 0, 0.7);
		background: rgba(255, 215, 0, 0.08);
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

	.game-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.pin-badge {
		font-size: 12px;
		background: rgba(255, 215, 0, 0.2);
		color: #ffe898;
		padding: 2px 8px;
		border-radius: 12px;
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

	.btn-admin {
		background: rgba(200, 169, 110, 0.12);
		color: #c8a96e;
		border: 1px solid rgba(200, 169, 110, 0.35);
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 12px;
		cursor: pointer;
	}

	.btn-admin.secondary {
		color: #9cc7ff;
		border-color: rgba(156, 199, 255, 0.45);
		background: rgba(156, 199, 255, 0.12);
	}

	.btn-admin.danger {
		color: #ffb3b3;
		border-color: rgba(255, 120, 120, 0.45);
		background: rgba(255, 120, 120, 0.12);
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

	@media (max-width: 700px) {
		.hero {
			padding-inline: 12px;
		}

		.target-controls,
		.game-card,
		.section-header {
			grid-template-columns: 1fr;
			display: grid;
		}

		.game-card {
			justify-items: stretch;
		}

		.game-info {
			justify-content: center;
		}

		.btn-join,
		.btn-create {
			width: 100%;
			text-align: center;
		}

		.users-dropdown {
			width: 100%;
		}
	}
</style>
