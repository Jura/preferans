<script lang="ts">
	import type { Contract, Suit, ContractLevel } from '$lib/types/preferans';

	interface Props {
		/** All valid bids in ascending order of strength */
		currentHighBid: Contract | null;
		myTurn: boolean;
		onBid: (bid: Contract | 'pass') => void;
	}

	let { currentHighBid, myTurn, onBid }: Props = $props();

	const SUITS: Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
	const SUIT_SYMBOLS: Record<Suit, string> = {
		spades: '♠',
		clubs: '♣',
		diamonds: '♦',
		hearts: '♥'
	};
	const SUIT_NAMES: Record<Suit, string> = {
		spades: 'Пики',
		clubs: 'Трефы',
		diamonds: 'Бубны',
		hearts: 'Червы'
	};
	const LEVELS: ContractLevel[] = [6, 7, 8, 9, 10];

	/** Numeric value of a contract for comparison */
	function contractValue(c: Contract): number {
		if (c.type === 'misere') return c.open ? 110 : 100;
		if (c.type === 'grand') return c.open ? 130 + c.level * 10 : 120 + c.level * 10;
		// suit contract: base value per level + suit rank (spades=0, clubs=1, diamonds=2, hearts=3, no_trump=4)
		const suitRank = c.suit === 'no_trump' ? 4 : SUITS.indexOf(c.suit as Suit);
		return (c.level - 6) * 60 + suitRank;
	}

	function isValidBid(contract: Contract): boolean {
		if (!currentHighBid) return true;
		return contractValue(contract) > contractValue(currentHighBid);
	}

	let selectedLevel: ContractLevel = $state(6);
	let selectedSuit: Suit | 'no_trump' = $state('spades');
</script>

<div class="bidding-panel" aria-label="Торговля">
	<h3 class="title">Ваш ход — сделайте ставку</h3>

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
				title={SUIT_NAMES[suit]}
			>
				{SUIT_SYMBOLS[suit]}
			</button>
		{/each}
		<button
			class="suit-btn nt"
			class:active={selectedSuit === 'no_trump'}
			onclick={() => (selectedSuit = 'no_trump')}
			title="Без козыря"
		>
			БК
		</button>
	</div>

	<div class="action-row">
		<button
			class="bid-btn"
			disabled={!myTurn || !isValidBid({ type: 'suit', level: selectedLevel, suit: selectedSuit })}
			onclick={() =>
				onBid({ type: 'suit', level: selectedLevel, suit: selectedSuit })}
		>
			Объявить {selectedLevel} {selectedSuit !== 'no_trump' ? SUIT_SYMBOLS[selectedSuit as Suit] : 'БК'}
		</button>

		<button
			class="misere-btn"
			disabled={!myTurn || !isValidBid({ type: 'misere', open: false })}
			onclick={() => onBid({ type: 'misere', open: false })}
		>
			Мизер
		</button>

		<button
			class="pass-btn"
			disabled={!myTurn}
			onclick={() => onBid('pass')}
		>
			Пас
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
