<script lang="ts">
	import { t } from '$lib/i18n';
	import { contractValue } from '$lib/types/preferans';
	import type { Contract, Suit, ContractLevel, ContractSuit } from '$lib/types/preferans';

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

	/** True when at least one suit at this level would beat the current high bid. */
	function isLevelUsable(level: ContractLevel): boolean {
		if (!currentHighBid) return true;
		// no_trump is the highest suit at any level; if even that doesn't beat
		// the current high bid, the entire level is dead.
		return contractValue({ type: 'suit', level, suit: 'no_trump' }) > contractValue(currentHighBid);
	}

	/** True when selectedLevel + this suit would beat the current high bid. */
	function isSuitUsable(suit: ContractSuit): boolean {
		if (!currentHighBid) return true;
		return (
			contractValue({ type: 'suit', level: selectedLevel, suit }) > contractValue(currentHighBid)
		);
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
				disabled={!isLevelUsable(level)}
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
				class:black={suit === 'spades' || suit === 'clubs'}
				class:red={suit === 'diamonds' || suit === 'hearts'}
				disabled={!isSuitUsable(suit)}
				onclick={() => (selectedSuit = suit)}
				title={$t(`app.bidding.suitName.${SUIT_TRANSLATION_KEYS[suit]}`)}
			>
				{SUIT_SYMBOLS[suit]}
			</button>
		{/each}
		<button
			class="suit-btn nt"
			class:active={selectedSuit === 'no_trump'}
			disabled={!isSuitUsable('no_trump')}
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
		background: var(--surface-3);
		border: 1px solid var(--border-gold);
		border-radius: var(--radius-md);
		padding: var(--space-4) var(--space-5);
		color: var(--cream-200);
		max-width: 360px;
		box-shadow: var(--shadow-md);
		animation: panel-in var(--dur-med) var(--ease-out);
	}

	@keyframes panel-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.title {
		margin: 0 0 14px;
		font-size: var(--text-base);
		color: var(--highlight);
		text-align: center;
		text-transform: uppercase;
		letter-spacing: 1px;
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		height: 48px;
		padding: 0 10px;
		border: 1px solid var(--border-gold);
		border-radius: var(--radius-md);
		background: var(--card-face);
		color: var(--ink-800);
		font-size: var(--text-lg);
		font-weight: 700;
		cursor: pointer;
		transition:
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out),
			transform var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}

	.level-btn:hover:not(:disabled),
	.suit-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: var(--shadow-sm);
	}

	.level-btn.active,
	.suit-btn.active {
		background: #fff7d6;
		border-color: var(--highlight);
		box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.35);
		transform: translateY(-1px);
	}

	.level-btn:disabled,
	.suit-btn:disabled {
		opacity: 0.4;
		filter: grayscale(0.2);
		background: rgba(255, 255, 255, 0.5);
		cursor: not-allowed;
	}

	.level-btn {
		font-variant-numeric: tabular-nums;
	}

	.suit-btn.black,
	.suit-btn.red,
	.suit-btn.nt {
		background: rgba(255, 255, 255, 0.96);
	}

	.suit-btn.black {
		color: var(--suit-black);
	}

	.suit-btn.red {
		color: var(--suit-red);
	}

	.suit-btn.nt {
		font-size: 14px;
		color: #6c5200;
		letter-spacing: 0.04em;
	}

	.bid-btn,
	.misere-btn,
	.pass-btn {
		padding: 8px 16px;
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
		cursor: pointer;
		border: none;
		transition:
			opacity var(--dur-fast) var(--ease-out),
			filter var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}

	.bid-btn:hover:not(:disabled),
	.misere-btn:hover:not(:disabled),
	.pass-btn:hover:not(:disabled) {
		filter: brightness(1.12);
		box-shadow: var(--shadow-sm);
	}

	.bid-btn {
		background: linear-gradient(180deg, var(--gold-400), var(--gold-500));
		color: var(--ink-800);
		font-weight: bold;
	}

	.misere-btn {
		background: var(--danger-strong);
		color: var(--cream-100);
	}

	.pass-btn {
		background: rgba(255, 255, 255, 0.1);
		color: var(--cream-200);
		border: 1px solid var(--border-subtle);
	}

	.bid-btn:disabled,
	.misere-btn:disabled,
	.pass-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
