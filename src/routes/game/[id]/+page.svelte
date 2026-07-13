<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { game, myHand, currentTrick, gamePhase } from '$lib/stores/game';
	import Hand from '$lib/components/Hand.svelte';
	import Table from '$lib/components/Table.svelte';
	import Scoreboard from '$lib/components/Scoreboard.svelte';
	import BiddingPanel from '$lib/components/BiddingPanel.svelte';
	import type { PageData } from './$types';
	import type { Card, Bid, Contract } from '$lib/types/preferans';

	let { data }: { data: PageData } = $props();

	let selectedCard: Card | null = $state(null);

	onMount(() => {
		game.connect(data.gameId, data.sessionToken);
	});

	onDestroy(() => {
		game.disconnect();
	});

	let isMyTurn = $derived(
		$game.state?.currentPlayerId === data.user?.id
	);

	let canPlayCard = $derived(
		$gamePhase === 'playing' && isMyTurn
	);

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

	const STATUS_LABEL: Record<string, string> = {
		disconnected: '⚫ Отключено',
		connecting: '🟡 Подключение…',
		connected: '🟢 Подключено',
		error: '🔴 Ошибка'
	};

	const PHASE_LABEL: Record<string, string> = {
		waiting: 'Ожидание игроков',
		dealing: 'Раздача карт',
		bidding: 'Торговля',
		widow: 'Прикуп',
		discard: 'Сброс карт',
		playing: 'Идёт игра',
		scoring: 'Подсчёт очков',
		finished: 'Игра завершена'
	};
</script>

<svelte:head>
	<title>Игра — Преферанс</title>
</svelte:head>

<div class="game-page">
	<!-- Status bar -->
	<div class="status-bar">
		<span class="connection-status">{STATUS_LABEL[$game.status]}</span>
		{#if $game.state}
			<span class="phase-label">{PHASE_LABEL[$gamePhase] ?? $gamePhase}</span>
			{#if $game.state.trump}
				<span class="trump-label">
					Козырь: {$game.state.trump === 'spades'
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
						<h4>Контракт</h4>
						{#if $game.state.contract.type === 'misere'}
							<p>{$game.state.contract.open ? 'Открытый мизер' : 'Мизер'}</p>
						{:else if $game.state.contract.type === 'grand'}
							<p>Гранд {$game.state.contract.level}</p>
						{:else}
							<p>
								{$game.state.contract.level}
								{$game.state.contract.suit === 'no_trump'
									? 'БК'
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
								Играет: {$game.state.players.find((p) => p.id === $game.state!.declarerId)?.name}
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
					<div class="spinner" aria-label="Загрузка"></div>
					<p>Подключение к игре…</p>
				</div>
			{:else if !$game.state || $gamePhase === 'waiting'}
				<div class="waiting-msg">
					<span class="waiting-icon">⏳</span>
					<p>Ожидание игроков… ({$game.state?.players.length ?? 0}/3)</p>
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
						<h3>Прикуп</h3>
						<div class="widow-cards">
							{#each $game.state.widow as card}
								<Hand cards={[card]} playable={false} />
							{/each}
						</div>
					</div>
				{/if}

				<!-- Bidding panel -->
				{#if $gamePhase === 'bidding' && isMyTurn}
					<div class="bidding-area">
						<BiddingPanel
							currentHighBid={$game.state.bids.length > 0
								? ($game.state.bids.findLast((b) => b.bid !== 'pass')?.bid as Contract | null)
								: null}
							myTurn={isMyTurn}
							onBid={handleBid}
						/>
					</div>
				{/if}

				<!-- Turn indicator -->
				{#if $game.state.currentPlayerId && $game.state.currentPlayerId !== data.user?.id}
					<div class="turn-indicator" role="status">
						Ход: {$game.state.players.find((p) => p.id === $game.state!.currentPlayerId)?.name}
					</div>
				{:else if isMyTurn && $gamePhase === 'playing'}
					<div class="turn-indicator my-turn" role="status">Ваш ход!</div>
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
						label="Ваши карты"
					/>
					{#if canPlayCard && selectedCard}
						<p class="play-hint">Нажмите на карту ещё раз, чтобы сыграть</p>
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

	.connecting-msg,
	.waiting-msg {
		text-align: center;
		padding: 48px;
		color: #c0b090;
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
	}
</style>
