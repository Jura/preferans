<script lang="ts">
	import { t } from '$lib/i18n';
	import { contractValue } from '$lib/types/preferans';
	import type { Contract, Suit, ContractLevel } from '$lib/types/preferans';

	interface Props {
		/** All valid bids in ascending order of strength */
		currentHighBid: Contract | null;
		myTurn: boolean;
		/** Misère may only be declared as the player's first bid */
		canMisere: boolean;
		onBid: (bid: Contract | 'pass') => void;
	}

	let { currentHighBid, myTurn, canMisere, onBid }: Props = $props();

	const SUITS: Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
	const SUIT_SYMBOLS: Record<Suit, string> = {
		spades: '♠',
		clubs: '♣',
		diamonds: '♦',
		hearts: '♥'
	};
	const SUIT_TRANSLATION_KEYS: Record<Suit, string> = {
		spades: 'spades',
		clubs: 'clubs',
		diamonds: 'diamonds',
		hearts: 'hearts'
	};
	const LEVELS: ContractLevel[] = [6, 7, 8, 9, 10];

	function isValidBid(contract: Contract): boolean {
		if (!currentHighBid) return true;
		return contractValue(contract) > contractValue(currentHighBid);
	}

	let selectedLevel: ContractLevel = $state(6);
	let selectedSuit: Suit | 'no_trump' = $state('spades');
</script>

<div class="bidding-panel" aria-label={$t('app.bidding.aria')}>
	<h3 class="title">{$t('app.bidding.title')}</h3>

	<div class="level-row">
		{#each LEVELS as level}
			<button
				class="level-btn"
				class:active={selectedLevel === level}
				onclick={() => (selectedLevel = level)}
			>
				{level}
			</button>
		{/each}
	</div>

	<div class="suit-row">
		{#each SUITS as suit}
			<button
				class="suit-btn"
				class:active={selectedSuit === suit}
				class:red={suit === 'diamonds' || suit === 'hearts'}
				onclick={() => (selectedSuit = suit)}
				title={$t(`app.bidding.suitName.${SUIT_TRANSLATION_KEYS[suit]}`)}
			>
				{SUIT_SYMBOLS[suit]}
			</button>
		{/each}
		<button
			class="suit-btn nt"
			class:active={selectedSuit === 'no_trump'}
			onclick={() => (selectedSuit = 'no_trump')}
			title={$t('app.bidding.noTrump')}
		>
			{$t('app.bidding.noTrumpShort')}
		</button>
	</div>

	<div class="action-row">
		<button
			class="bid-btn"
			disabled={!myTurn || !isValidBid({ type: 'suit', level: selectedLevel, suit: selectedSuit })}
			onclick={() => onBid({ type: 'suit', level: selectedLevel, suit: selectedSuit })}
		>
			{$t('app.bidding.announce', {
				level: selectedLevel,
				suit:
					selectedSuit !== 'no_trump'
						? SUIT_SYMBOLS[selectedSuit as Suit]
						: $t('app.bidding.noTrumpShort')
			})}
		</button>

		<button
			class="misere-btn"
			disabled={!myTurn || !canMisere || !isValidBid({ type: 'misere' })}
			onclick={() => onBid({ type: 'misere' })}
		>
			{$t('app.bidding.misere')}
		</button>

		<button class="pass-btn" disabled={!myTurn} onclick={() => onBid('pass')}>
			{$t('app.bidding.pass')}
		</button>
	</div>
</div>

<style>
	.bidding-panel {
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid #c8a96e;
		border-radius: 10px;
		padding: 16px 20px;
		color: #f0e6d3;
		max-width: 360px;
	}

	.title {
		margin: 0 0 14px;
		font-size: 14px;
		color: #ffd700;
		text-align: center;
	}

	.level-row,
	.suit-row,
	.action-row {
		display: flex;
		gap: 8px;
		justify-content: center;
		margin-bottom: 10px;
		flex-wrap: wrap;
	}

	.level-btn,
	.suit-btn {
		width: 40px;
		height: 40px;
		border: 1px solid #c8a96e;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.05);
		color: #f0e6d3;
		font-size: 16px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.level-btn.active,
	.suit-btn.active {
		background: rgba(200, 169, 110, 0.3);
		border-color: #ffd700;
		color: #ffd700;
	}

	.suit-btn.red {
		color: #e74c3c;
	}

	.suit-btn.red.active {
		color: #ff6b6b;
	}

	.suit-btn.nt {
		width: auto;
		padding: 0 8px;
		font-size: 12px;
	}

	.bid-btn,
	.misere-btn,
	.pass-btn {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 14px;
		cursor: pointer;
		border: none;
		transition: opacity 0.15s;
	}

	.bid-btn {
		background: #c8a96e;
		color: #1a1a2e;
		font-weight: bold;
	}

	.misere-btn {
		background: #8b0000;
		color: #fff;
	}

	.pass-btn {
		background: rgba(255, 255, 255, 0.1);
		color: #f0e6d3;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.bid-btn:disabled,
	.misere-btn:disabled,
	.pass-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
