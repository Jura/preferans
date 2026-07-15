<script lang="ts">
	import CardComponent from './Card.svelte';
	import PlayerBadge from './PlayerBadge.svelte';
	import { t } from '$lib/i18n';
	import type { Trick, Player, Card, Contract } from '$lib/types/preferans';

	interface Props {
		trick: Trick | null;
		players: Player[];
		myPlayerId: string;
		trump?: import('$lib/types/preferans').Suit | null;
		currentPlayerId?: string | null;
		currentContract?: Contract | null;
	}

	let {
		trick,
		players,
		myPlayerId,
		trump = null,
		currentPlayerId = null,
		currentContract = null
	}: Props = $props();

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

	function contractSuitClass(contract: Contract | null): string {
		if (!contract) return '';
		if (contract.type === 'misere') return '';
		if (contract.suit === 'no_trump') return 'suit-nt';
		if (contract.suit === 'diamonds' || contract.suit === 'hearts') return 'suit-red';
		if (contract.suit === 'spades' || contract.suit === 'clubs') return 'suit-black';
		return '';
	}
</script>

<div class="table" aria-label={$t('app.table.aria')}>
	{#if trump}
		<div class="trump-indicator" title={$t('app.game.trump')}>
			<span
				class={`trump-suit ${trump === 'diamonds' || trump === 'hearts' ? 'suit-red' : 'suit-black'}`}
			>
				{SUIT_SYMBOLS[trump]}
			</span>
			<span class="trump-label">{$t('app.game.trump')}</span>
		</div>
	{/if}

	<div class="table-center">
		{#each players as player}
			{@const card = getCardForPlayer(player.id)}
			<div
				class="player-slot"
				class:self={player.id === myPlayerId}
				class:current-turn={player.id === currentPlayerId}
				style="--pos: {player.position}"
			>
				<div class="player-name">
					<PlayerBadge
						playerId={player.id}
						name={player.name}
						offline={player.isOnline === false}
					/>
					{#if player.id === currentPlayerId && currentContract}
						<span class={`current-contract ${contractSuitClass(currentContract)}`}>
							{#if currentContract.type === 'misere'}
								{$t('app.game.misere')}
							{:else}
								{currentContract.level}
								{currentContract.suit === 'no_trump'
									? $t('app.game.noTrumpShort')
									: SUIT_SYMBOLS[currentContract.suit]}
							{/if}
						</span>
					{/if}
				</div>
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
		--table-width: 420px;
		--table-height: 280px;
		--table-max-height: 60dvh;

		position: relative;
		width: min(var(--table-width), 100%);
		height: min(var(--table-height), var(--table-max-height));
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
	}

	.trump-suit {
		font-size: 24px;
		line-height: 1;
	}

	.trump-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: #ffd700;
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
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.player-name :global(.player-badge) {
		color: inherit;
		font-size: inherit;
	}

	.player-slot.self .player-name {
		color: #ffd700;
		font-weight: bold;
	}

	.player-slot.current-turn .player-name {
		border: 1px solid rgba(255, 215, 0, 0.8);
		background: rgba(255, 215, 0, 0.14);
		color: #ffd700;
	}

	.player-slot.current-turn .played-card {
		filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.6));
	}

	.current-contract {
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		padding: 2px 5px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.suit-black {
		color: #111;
		background: rgba(255, 255, 255, 0.9);
	}

	.suit-red {
		color: #c0392b;
		background: rgba(255, 255, 255, 0.92);
	}

	.suit-nt {
		color: #ffd700;
		border-color: rgba(255, 215, 0, 0.5);
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

	@media (max-width: 480px) {
		.table {
			width: 280px;
			height: 200px;
			border-width: 3px;
		}

		.table-center {
			width: 160px;
			height: 130px;
		}

		.trump-suit {
			font-size: 16px;
		}

		.trump-label {
			font-size: 8px;
		}
	}
</style>
