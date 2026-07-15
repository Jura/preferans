<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { game, myHand, currentTrick, gamePhase } from '$lib/stores/game';
	import Hand from '$lib/components/Hand.svelte';
	import Table from '$lib/components/Table.svelte';
	import Scoreboard from '$lib/components/Scoreboard.svelte';
	import BiddingPanel from '$lib/components/BiddingPanel.svelte';
	import { t } from '$lib/i18n';
	import type { PageData } from './$types';
	import type { Card, Bid, Contract } from '$lib/types/preferans';

	let { data }: { data: PageData } = $props();

	let selectedCard: Card | null = $state(null);
	let tableAgeSeconds = $state(0);
	let tableTimer: ReturnType<typeof setInterval> | null = null;

	function updateTableAge() {
		const createdAt = Date.parse(data.createdAt);
		const hasValidCreatedAt = !Number.isNaN(createdAt) && createdAt > 0 && createdAt <= Date.now();
		tableAgeSeconds = hasValidCreatedAt
			? Math.max(0, Math.floor((Date.now() - createdAt) / 1000))
			: 0;
	}

	function formatElapsed(seconds: number) {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		return [hours, minutes, secs].map((value) => value.toString().padStart(2, '0')).join(':');
	}

	onMount(() => {
		game.connect(data.gameId, data.sessionToken);
		updateTableAge();
		tableTimer = setInterval(updateTableAge, 1000);
	});

	onDestroy(() => {
		if (tableTimer) {
			clearInterval(tableTimer);
		}
		game.disconnect();
	});

	let isMyTurn = $derived($game.state?.currentPlayerId === data.user?.id);
	let myPlayerId = $derived(data.user?.id ?? '');
	let finishProposal = $derived($game.state?.finishProposal ?? null);
	let pauseProposal = $derived($game.state?.pauseProposal ?? null);
	// Backend enforces mutual exclusion (only one proposal can be active at a time).
	let activeProposal = $derived(finishProposal ?? pauseProposal);
	let isProposalProposer = $derived(activeProposal?.proposedBy === myPlayerId);
	let hasPendingVote = $derived(activeProposal ? activeProposal.votes[myPlayerId] === null : false);

	let canPlayCard = $derived($gamePhase === 'playing' && isMyTurn);

	function handlePlayCard(card: Card) {
		if (!canPlayCard) return;
		if (selectedCard?.suit === card.suit && selectedCard?.rank === card.rank) {
			// Second click confirms the card play
			game.send({ type: 'play_card', card });
			selectedCard = null;
		} else {
			selectedCard = card;
		}
	}

	function handleBid(bid: Bid) {
		game.send({ type: 'bid', bid });
	}

	function proposeFinishEarly() {
		game.send({ type: 'request_finish_early' });
	}

	function proposePause(durationMinutes: number | null) {
		game.send({ type: 'request_pause', durationMinutes });
	}

	function voteOnProposal(approve: boolean) {
		if (finishProposal) {
			game.send({ type: 'vote_finish_early', approve });
			return;
		}
		if (pauseProposal) {
			game.send({ type: 'vote_pause', approve });
		}
	}
</script>

<svelte:head>
	<title>{$t('app.game.title')}</title>
</svelte:head>

<div class="game-page">
	<!-- Status bar -->
	<div class="status-bar">
		<span class="connection-status">{$t(`app.game.status.${$game.status}`)}</span>
		<span class="table-stat">{$t('app.game.tableAge')}: {formatElapsed(tableAgeSeconds)}</span>
		<span class="table-stat">{$t('app.game.bulletTarget')}: {data.bulletTarget}</span>
		{#if $game.state}
			<span class="phase-label">{$t(`app.phase.${$gamePhase}`)}</span>
			{#if $game.state.trump}
				<span class="trump-label">
					{$t('app.game.trump')}: {$game.state.trump === 'spades'
						? '♠'
						: $game.state.trump === 'clubs'
							? '♣'
							: $game.state.trump === 'diamonds'
								? '♦'
								: '♥'}
				</span>
			{/if}
		{/if}
		{#if $game.error}
			<span class="error-msg" role="alert">{$game.error}</span>
		{/if}
	</div>

	{#if $game.state && $gamePhase !== 'waiting' && $gamePhase !== 'finished'}
		<div class="governance-actions">
			<button
				type="button"
				class="governance-btn"
				onclick={proposeFinishEarly}
				disabled={Boolean(activeProposal)}
				aria-disabled={Boolean(activeProposal)}
			>
				{$t('app.game.suggestFinishEarly')}
			</button>
			{#if $gamePhase !== 'paused'}
				<button
					type="button"
					class="governance-btn"
					onclick={() => proposePause(60)}
					disabled={Boolean(activeProposal)}
					aria-disabled={Boolean(activeProposal)}
				>
					{$t('app.game.suggestPauseHour')}
				</button>
				<button
					type="button"
					class="governance-btn"
					onclick={() => proposePause(null)}
					disabled={Boolean(activeProposal)}
					aria-disabled={Boolean(activeProposal)}
				>
					{$t('app.game.suggestPauseIndefinite')}
				</button>
			{/if}
		</div>
	{/if}

	{#if activeProposal}
		<div class="proposal-banner" role="status">
			<p>
				{$t('app.game.proposalBy', {
					name: $game.state?.players.find((p) => p.id === activeProposal.proposedBy)?.name ?? ''
				})}
			</p>
			{#if hasPendingVote && !isProposalProposer}
				<div class="proposal-actions">
					<button type="button" class="vote-btn yes" onclick={() => voteOnProposal(true)}>
						{$t('app.game.voteYes')}
					</button>
					<button type="button" class="vote-btn no" onclick={() => voteOnProposal(false)}>
						{$t('app.game.voteNo')}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if $gamePhase === 'paused'}
		{@const pausedUntil = $game.state?.pausedUntil ?? null}
		<div class="proposal-banner" role="status">
			{#if pausedUntil !== null}
				<p>
					{$t('app.game.pausedUntil', { time: new Date(pausedUntil).toLocaleString() })}
				</p>
			{:else}
				<p>{$t('app.game.pausedIndefinitely')}</p>
			{/if}
		</div>
	{/if}

	<!-- Main game area -->
	<div class="game-area">
		<!-- Sidebar: scoreboard -->
		<aside class="sidebar">
			{#if $game.state}
				<Scoreboard
					scores={$game.state.scores}
					players={$game.state.players}
					roundNumber={$game.state.roundNumber}
				/>

				<!-- Contract info -->
				{#if $game.state.contract}
					<div class="contract-info">
						<h4>{$t('app.game.contract')}</h4>
						{#if $game.state.contract.type === 'misere'}
							<p>{$game.state.contract.open ? $t('app.game.openMisere') : $t('app.game.misere')}</p>
						{:else if $game.state.contract.type === 'grand'}
							<p>{$t('app.game.grand')} {$game.state.contract.level}</p>
						{:else}
							<p>
								{$game.state.contract.level}
								{$game.state.contract.suit === 'no_trump'
									? $t('app.game.noTrumpShort')
									: $game.state.contract.suit === 'spades'
										? '♠'
										: $game.state.contract.suit === 'clubs'
											? '♣'
											: $game.state.contract.suit === 'diamonds'
												? '♦'
												: '♥'}
							</p>
						{/if}
						{#if $game.state.declarerId}
							<p class="declarer">
								{$t('app.game.declarer', {
									name: $game.state.players.find((p) => p.id === $game.state!.declarerId)?.name
								})}
							</p>
						{/if}
					</div>
				{/if}
			{/if}
		</aside>

		<!-- Center: table + hand -->
		<div class="center-area">
			{#if $game.status === 'connecting'}
				<div class="connecting-msg">
					<div class="spinner" aria-label={$t('app.game.loadingAria')}></div>
					<p>{$t('app.game.connecting')}</p>
				</div>
			{:else if !$game.state || $gamePhase === 'waiting'}
				<div class="waiting-shell">
					{#if data.isPlayer}
						<form method="POST" action="?/leaveTable" class="leave-table-form">
							<button type="submit" class="leave-table-btn">{$t('app.game.leaveTable')}</button>
						</form>
					{/if}
					<div class="waiting-msg">
						<span class="waiting-icon">⏳</span>
						<p>{$t('app.game.waitingPlayers', { count: $game.state?.players.length ?? 0 })}</p>
					</div>
				</div>
			{:else}
				<!-- Playing table -->
				<Table
					trick={$currentTrick}
					players={$game.state.players}
					myPlayerId={data.user?.id ?? ''}
					trump={$game.state.trump}
				/>

				<!-- Widow cards (during widow phase for declarer) -->
				{#if $gamePhase === 'widow' && $game.state.widow.length > 0 && $game.state.declarerId === data.user?.id}
					<div class="widow-area">
						<h3>{$t('app.game.widow')}</h3>
						<div class="widow-cards">
							{#each $game.state.widow as card}
								<Hand cards={[card]} playable={false} />
							{/each}
						</div>
					</div>
				{/if}

				<!-- Bidding panel -->
				{#if $gamePhase === 'bidding' && isMyTurn}
					{@const nonPassBids = $game.state.bids.filter((b) => b.bid !== 'pass')}
					{@const currentHighBid =
						nonPassBids.length > 0 ? (nonPassBids[nonPassBids.length - 1].bid as Contract) : null}
					<div class="bidding-area">
						<BiddingPanel {currentHighBid} myTurn={isMyTurn} onBid={handleBid} />
					</div>
				{/if}

				<!-- Turn indicator -->
				{#if $game.state.currentPlayerId && $game.state.currentPlayerId !== data.user?.id}
					<div class="turn-indicator" role="status">
						{$t('app.game.turn', {
							name: $game.state.players.find((p) => p.id === $game.state!.currentPlayerId)?.name
						})}
					</div>
				{:else if isMyTurn && $gamePhase === 'playing'}
					<div class="turn-indicator my-turn" role="status">{$t('app.game.yourTurn')}</div>
				{/if}
			{/if}

			<!-- Player hand -->
			{#if $myHand.length > 0}
				<div class="my-hand">
					<Hand
						cards={$myHand}
						playable={canPlayCard}
						{selectedCard}
						onPlayCard={handlePlayCard}
						label={$t('app.game.yourCards')}
					/>
					{#if canPlayCard && selectedCard}
						<p class="play-hint">{$t('app.game.playHint')}</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.game-page {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 16px;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 8px;
		font-size: 13px;
		flex-wrap: wrap;
	}

	.governance-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.governance-btn {
		border: 1px solid rgba(200, 169, 110, 0.35);
		background: rgba(200, 169, 110, 0.12);
		color: #f0e6d3;
		border-radius: 999px;
		padding: 8px 14px;
		font-size: 13px;
		cursor: pointer;
	}

	.governance-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.proposal-banner {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 12px;
		padding: 10px 14px;
		color: #f0e6d3;
		display: grid;
		gap: 8px;
	}

	.proposal-banner p {
		margin: 0;
	}

	.proposal-actions {
		display: flex;
		gap: 8px;
	}

	.vote-btn {
		border-radius: 8px;
		border: 1px solid transparent;
		padding: 6px 10px;
		font-size: 13px;
		cursor: pointer;
	}

	.vote-btn.yes {
		background: rgba(46, 204, 113, 0.16);
		border-color: rgba(46, 204, 113, 0.5);
		color: #b7f7d0;
	}

	.vote-btn.no {
		background: rgba(255, 107, 107, 0.14);
		border-color: rgba(255, 107, 107, 0.5);
		color: #ffd2d2;
	}

	.phase-label {
		color: #ffd700;
		font-weight: bold;
	}

	.trump-label {
		color: #c8a96e;
	}

	.error-msg {
		color: #ff6b6b;
		margin-left: auto;
	}

	.game-area {
		display: flex;
		gap: 24px;
		align-items: flex-start;
	}

	.sidebar {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.contract-info {
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 8px;
		padding: 12px;
		color: #f0e6d3;
		font-size: 14px;
	}

	.contract-info h4 {
		margin: 0 0 8px;
		color: #c8a96e;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.contract-info p {
		margin: 4px 0;
	}

	.declarer {
		color: #ffd700;
		font-style: italic;
	}

	.center-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
	}

	.table-stat {
		color: #c0b090;
	}

	.connecting-msg,
	.waiting-msg {
		text-align: center;
		padding: 48px;
		color: #c0b090;
	}

	.waiting-shell {
		display: grid;
		gap: 16px;
		width: min(100%, 520px);
	}

	.leave-table-form {
		display: flex;
		justify-content: center;
	}

	.leave-table-btn {
		border: 1px solid rgba(255, 107, 107, 0.35);
		background: rgba(255, 107, 107, 0.12);
		color: #ffd2d2;
		border-radius: 999px;
		padding: 10px 18px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.waiting-icon,
	.connecting-msg {
		font-size: 48px;
		display: block;
		margin-bottom: 12px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(200, 169, 110, 0.2);
		border-top-color: #c8a96e;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 16px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.widow-area {
		text-align: center;
	}

	.widow-area h3 {
		color: #c8a96e;
		margin: 0 0 8px;
	}

	.widow-cards {
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	.bidding-area {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.turn-indicator {
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 20px;
		padding: 6px 18px;
		font-size: 14px;
		color: #c0b090;
	}

	.turn-indicator.my-turn {
		background: rgba(255, 215, 0, 0.15);
		border-color: #ffd700;
		color: #ffd700;
		font-weight: bold;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.3);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(255, 215, 0, 0);
		}
	}

	.my-hand {
		width: 100%;
		text-align: center;
	}

	.play-hint {
		font-size: 12px;
		color: #888;
		margin: 4px 0 0;
	}

	@media (max-width: 768px) {
		.game-area {
			flex-direction: column;
		}

		.sidebar {
			width: 100%;
			flex-direction: row;
			flex-wrap: wrap;
		}

		.waiting-shell,
		.leave-table-btn {
			width: 100%;
		}
	}
</style>
