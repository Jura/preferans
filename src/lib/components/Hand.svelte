<script lang="ts">
	import CardComponent from './Card.svelte';
	import { t } from '$lib/i18n';
	import type { Card } from '$lib/types/preferans';

	interface Props {
		cards: Card[];
		playable?: boolean;
		selectedCard?: Card | null;
		onPlayCard?: (card: Card) => void;
		label?: string;
	}

	let {
		cards,
		playable = false,
		selectedCard = null,
		onPlayCard,
		label = ''
	}: Props = $props();

	let ariaLabel = $derived(label || $t('app.game.yourCards'));

	function isSelected(card: Card): boolean {
		return selectedCard?.suit === card.suit && selectedCard?.rank === card.rank;
	}

	function handleCardClick(card: Card) {
		if (playable && onPlayCard) {
			onPlayCard(card);
		}
	}
</script>

<div class="hand" aria-label={ariaLabel} role="group">
	{#each cards as card (card.suit + card.rank)}
		<CardComponent
			{card}
			selected={isSelected(card)}
			{playable}
			onclick={() => handleCardClick(card)}
		/>
	{/each}
	{#if cards.length === 0}
		<span class="empty">{$t('app.hand.empty')}</span>
	{/if}
</div>

<style>
	.hand {
		display: flex;
		flex-wrap: nowrap;
		gap: -8px;
		justify-content: center;
		padding: 8px 0;
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

	.empty {
		color: #aaa;
		font-style: italic;
		padding: 16px;
	}
</style>
