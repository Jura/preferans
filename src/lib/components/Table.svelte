<script lang="ts">
	import CardComponent from './Card.svelte';
	import { t } from '$lib/i18n';
	import type { Trick, Player, Card } from '$lib/types/preferans';

	interface Props {
		trick: Trick | null;
		players: Player[];
		myPlayerId: string;
		trump?: import('$lib/types/preferans').Suit | null;
	}

	let { trick, players, myPlayerId, trump = null }: Props = $props();

	const SUIT_SYMBOLS: Record<string, string> = {
		spades: '♠',
		clubs: '♣',
		diamonds: '♦',
		hearts: '♥'
	};

	function getPlayerName(playerId: string): string {
		return players.find((p) => p.id === playerId)?.name ?? $t('app.table.fallbackPlayer');
	}

	function getCardForPlayer(playerId: string): Card | null {
		return trick?.cards.find((c) => c.playerId === playerId)?.card ?? null;
	}
</script>

<div class="table" aria-label={$t('app.table.aria')}>
	{#if trump}
		<div class="trump-indicator" title={$t('app.game.trump')}>
			<span class="trump-suit">{SUIT_SYMBOLS[trump]}</span>
			<span class="trump-label">{$t('app.game.trump')}</span>
		</div>
	{/if}

	<div class="table-center">
		{#each players as player}
			{@const card = getCardForPlayer(player.id)}
			<div
				class="player-slot"
				class:self={player.id === myPlayerId}
				style="--pos: {player.position}"
			>
				<div class="player-name">{player.name}</div>
				<div class="played-card">
					{#if card}
						<CardComponent {card} playable={false} />
					{:else}
						<div class="empty-slot" aria-label={$t('app.table.emptySlot')}></div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	{#if trick?.winnerId}
		<div class="trick-winner" role="status">
			{$t('app.table.winner', { name: getPlayerName(trick.winnerId) })}
		</div>
	{/if}
</div>

<style>
	.table {
		position: relative;
		width: 420px;
		height: 280px;
		background: radial-gradient(ellipse at center, #2d6a4f 0%, #1b4332 100%);
		border-radius: 50%;
		border: 4px solid #c8a96e;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto;
	}

	.trump-indicator {
		position: absolute;
		top: 8px;
		right: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 8px;
		padding: 4px 8px;
		color: #ffd700;
	}

	.trump-suit {
		font-size: 24px;
		line-height: 1;
	}

	.trump-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.table-center {
		position: relative;
		width: 240px;
		height: 180px;
	}

	.player-slot {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	/* Position 0 = bottom (self), 1 = left, 2 = right */
	.player-slot:nth-child(1) {
		bottom: -16px;
		left: 50%;
		transform: translateX(-50%);
	}
	.player-slot:nth-child(2) {
		left: -16px;
		top: 50%;
		transform: translateY(-50%);
	}
	.player-slot:nth-child(3) {
		right: -16px;
		top: 50%;
		transform: translateY(-50%);
	}

	.player-name {
		font-size: 12px;
		color: #d4e9d1;
		white-space: nowrap;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 4px;
		padding: 2px 6px;
	}

	.player-slot.self .player-name {
		color: #ffd700;
		font-weight: bold;
	}

	.played-card {
		min-width: 64px;
		min-height: 96px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.empty-slot {
		width: 64px;
		height: 96px;
		border: 2px dashed rgba(255, 255, 255, 0.2);
		border-radius: 8px;
	}

	.trick-winner {
		position: absolute;
		bottom: -48px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(255, 215, 0, 0.9);
		color: #1a1a2e;
		padding: 4px 12px;
		border-radius: 20px;
		font-weight: bold;
		font-size: 14px;
		white-space: nowrap;
		animation: fadeIn 0.3s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
</style>
