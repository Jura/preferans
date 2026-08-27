<script lang="ts">
	import CardComponent from './Card.svelte';
	import { t } from '$lib/i18n';
	import type { Card, Suit } from '$lib/types/preferans';
	import { RANK_ORDER } from '$lib/types/preferans';

	interface Props {
		cards: Card[];
		playable?: boolean;
		selectedCard?: Card | null;
		selectedCards?: Card[];
		eligibleCards?: Card[] | null;
		onPlayCard?: (card: Card) => void;
		label?: string;
		/** When true, display cards grouped by suit in rows (for landscape open-hand panels) */
		groupBySuit?: boolean;
		/** When true, add a visible gap between suit groups in the flat row layout */
		showSuitGaps?: boolean;
	}

	let {
		cards,
		playable = false,
		selectedCard = null,
		selectedCards = [],
		eligibleCards = null,
		onPlayCard,
		label,
		groupBySuit = false,
		showSuitGaps = false
	}: Props = $props();

	function isSelected(card: Card): boolean {
		if (selectedCard?.suit === card.suit && selectedCard?.rank === card.rank) return true;
		return selectedCards.some((c) => c.suit === card.suit && c.rank === card.rank);
	}

	function isEligible(card: Card): boolean {
		if (!eligibleCards) return true;
		return eligibleCards.some((c) => c.suit === card.suit && c.rank === card.rank);
	}

	function handleCardClick(card: Card) {
		if (playable && isEligible(card) && onPlayCard) {
			onPlayCard(card);
		}
	}

	const SUIT_ORDER: Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];

	/** Returns cards grouped by suit in a fixed order, sorted 7→A within each suit */
	let groupedBySuit = $derived(() => {
		const bySuit = new Map<Suit, Card[]>();
		for (const card of cards) {
			if (!bySuit.has(card.suit)) bySuit.set(card.suit, []);
			bySuit.get(card.suit)!.push(card);
		}
		for (const suitCards of bySuit.values()) {
			suitCards.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
		}
		return SUIT_ORDER.filter((s) => bySuit.has(s)).map((s) => bySuit.get(s)!);
	});

	/**
	 * For the flat hand layout with suit gaps: split the already-sorted `cards` array
	 * into groups by suit (maintaining the incoming order).
	 */
	let suitGroups = $derived(() => {
		if (!showSuitGaps || cards.length === 0) return null;
		const groups: Card[][] = [];
		let current: Card[] = [];
		for (const card of cards) {
			if (current.length > 0 && current[current.length - 1].suit !== card.suit) {
				groups.push(current);
				current = [];
			}
			current.push(card);
		}
		if (current.length > 0) groups.push(current);
		return groups;
	});
</script>

{#if groupBySuit}
	<div class="hand-grouped" aria-label={label ?? $t('app.game.yourCards')} role="group">
		{#each groupedBySuit() as suitRow}
			<div class="suit-row">
				{#each suitRow as card (card.suit + card.rank)}
					<CardComponent
						{card}
						selected={isSelected(card)}
						{playable}
						eligible={isEligible(card)}
						onclick={() => handleCardClick(card)}
					/>
				{/each}
			</div>
		{/each}
		{#if cards.length === 0}
			<span class="empty">{$t('app.hand.empty')}</span>
		{/if}
	</div>
{:else if showSuitGaps && suitGroups()}
	<div class="hand hand-suit-gaps" aria-label={label ?? $t('app.game.yourCards')} role="group">
		{#each suitGroups()! as group, gi}
			{#if gi > 0}
				<div class="suit-gap"></div>
			{/if}
			{#each group as card (card.suit + card.rank)}
				<CardComponent
					{card}
					selected={isSelected(card)}
					{playable}
					eligible={isEligible(card)}
					onclick={() => handleCardClick(card)}
				/>
			{/each}
		{/each}
		{#if cards.length === 0}
			<span class="empty">{$t('app.hand.empty')}</span>
		{/if}
	</div>
{:else}
	<div class="hand" aria-label={label ?? $t('app.game.yourCards')} role="group">
		{#each cards as card (card.suit + card.rank)}
			<CardComponent
				{card}
				selected={isSelected(card)}
				{playable}
				eligible={isEligible(card)}
				onclick={() => handleCardClick(card)}
			/>
		{/each}
		{#if cards.length === 0}
			<span class="empty">{$t('app.hand.empty')}</span>
		{/if}
	</div>
{/if}

<style>
	.hand {
		display: flex;
		flex-wrap: nowrap;
		gap: -8px;
		justify-content: center;
		padding: 18px 0 8px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.hand :global(.card) {
		margin-right: -10px;
		transition:
			transform 0.15s ease,
			margin 0.15s ease;
	}

	.hand :global(.card:hover.playable),
	.hand :global(.card.selected) {
		margin-right: 4px;
		z-index: 10;
	}

	/* Suit gap spacer: slightly widens the overlap gap between suit groups */
	.suit-gap {
		width: 8px;
		flex-shrink: 0;
	}

	.hand-grouped {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 0;
	}

	.suit-row {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
	}

	.suit-row :global(.card) {
		margin-right: -18px;
		transition:
			transform 0.15s ease,
			margin 0.15s ease;
	}

	.suit-row :global(.card:last-child) {
		margin-right: 0;
	}

	.suit-row :global(.card:hover.playable),
	.suit-row :global(.card.selected) {
		margin-right: 4px;
		z-index: 10;
	}

	.empty {
		color: #aaa;
		font-style: italic;
		padding: 16px;
	}

	@media (max-width: 480px) {
		.hand :global(.card) {
			margin-right: -6px;
		}

		.hand :global(.card:hover.playable),
		.hand :global(.card.selected) {
			margin-right: 2px;
		}

		.suit-row :global(.card) {
			margin-right: -12px;
		}
	}
</style>
