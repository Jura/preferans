<script lang="ts">
	import type { Card, Suit } from '$lib/types/preferans';
	import { t } from '$lib/i18n';

	interface Props {
		card: Card;
		selected?: boolean;
		playable?: boolean;
		faceDown?: boolean;
		onclick?: () => void;
	}

	let { card, selected = false, playable = true, faceDown = false, onclick }: Props = $props();

	const SUIT_SYMBOLS: Record<Suit, string> = {
		spades: '♠',
		clubs: '♣',
		diamonds: '♦',
		hearts: '♥'
	};

	const RED_SUITS: Suit[] = ['diamonds', 'hearts'];

	let isRed = $derived(RED_SUITS.includes(card.suit));
	let symbol = $derived(SUIT_SYMBOLS[card.suit]);
</script>

<button
	class="card"
	class:selected
	class:playable
	class:face-down={faceDown}
	class:red={isRed}
	class:black={!isRed}
	onclick={onclick}
	disabled={!playable || faceDown}
	aria-label={faceDown
		? $t('app.card.faceDown')
		: $t('app.card.cardAria', { rank: card.rank, suit: SUIT_SYMBOLS[card.suit] })}
>
	{#if faceDown}
		<span class="back-pattern">🂠</span>
	{:else}
		<span class="corner top-left">
			<span class="rank">{card.rank}</span>
			<span class="suit">{symbol}</span>
		</span>
		<span class="center-suit">{symbol}</span>
		<span class="corner bottom-right">
			<span class="rank">{card.rank}</span>
			<span class="suit">{symbol}</span>
		</span>
	{/if}
</button>

<style>
	.card {
		position: relative;
		width: 64px;
		height: 96px;
		border: 2px solid #c8a96e;
		border-radius: 8px;
		background: #fff;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			border-color 0.15s ease;
		font-family: Georgia, serif;
		padding: 4px;
		user-select: none;
	}

	.card:hover.playable {
		transform: translateY(-12px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
	}

	.card.selected {
		transform: translateY(-16px);
		border-color: #ffd700;
		box-shadow: 0 8px 20px rgba(255, 215, 0, 0.5);
	}

	.card:not(.playable) {
		cursor: default;
		opacity: 0.85;
	}

	.card.face-down {
		background: linear-gradient(135deg, #1a3c5e 25%, #2563a8 50%, #1a3c5e 75%);
		cursor: default;
	}

	.corner {
		position: absolute;
		font-size: 14px;
		line-height: 1.1;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.top-left {
		top: 4px;
		left: 6px;
	}

	.bottom-right {
		bottom: 4px;
		right: 6px;
		transform: rotate(180deg);
	}

	.center-suit {
		font-size: 28px;
		line-height: 1;
	}

	.rank {
		font-size: 14px;
		font-weight: bold;
		line-height: 1;
	}

	.suit {
		font-size: 12px;
		line-height: 1;
	}

	.red {
		color: #c0392b;
	}

	.black {
		color: #1a1a2e;
	}

	.back-pattern {
		font-size: 64px;
		opacity: 0.4;
		color: #fff;
	}
</style>
