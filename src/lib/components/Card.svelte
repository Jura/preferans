<script lang="ts">
	import type { Card, Suit } from '$lib/types/preferans';
	import { t } from '$lib/i18n';

	interface Props {
		card: Card;
		selected?: boolean;
		playable?: boolean;
		eligible?: boolean;
		faceDown?: boolean;
		onclick?: () => void;
	}

	let {
		card,
		selected = false,
		playable = true,
		eligible = true,
		faceDown = false,
		onclick
	}: Props = $props();

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
	class:ineligible={playable && !eligible}
	{onclick}
	disabled={!playable || faceDown || !eligible}
	aria-label={faceDown
		? $t('app.card.faceDown')
		: $t('app.card.cardAria', { rank: card.rank, suit: SUIT_SYMBOLS[card.suit] })}
>
	{#if faceDown}
		<span class="back-inner" aria-hidden="true"></span>
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
		width: var(--card-w);
		height: var(--card-h);
		border: 1px solid rgba(20, 20, 31, 0.25);
		border-radius: var(--card-radius);
		background: linear-gradient(160deg, var(--card-face) 0%, var(--card-face-muted) 100%);
		box-shadow: var(--shadow-sm);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			transform var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			opacity var(--dur-fast) var(--ease-out);
		font-family: var(--font-display);
		padding: 4px;
		user-select: none;
		flex-shrink: 0;
		animation: deal-in var(--dur-med) var(--ease-out);
	}

	@keyframes deal-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.card:hover.playable {
		transform: translateY(calc(var(--card-h) * -0.12));
		box-shadow: var(--shadow-lg);
		border-color: var(--gold-500);
	}

	.card.selected {
		transform: translateY(calc(var(--card-h) * -0.16));
		border-color: var(--highlight);
		box-shadow:
			0 0 0 2px var(--highlight),
			var(--glow-gold),
			var(--shadow-md);
	}

	.card:focus-visible {
		outline: var(--focus-ring);
		outline-offset: var(--focus-offset);
		z-index: 20;
	}

	.card:not(.playable) {
		cursor: default;
		opacity: 0.92;
	}

	.card.ineligible {
		opacity: 0.45;
		filter: grayscale(35%);
		cursor: not-allowed;
	}

	.card.face-down {
		background: linear-gradient(
			145deg,
			var(--card-back-1) 0%,
			var(--card-back-2) 55%,
			var(--card-back-1) 100%
		);
		border-color: var(--gold-600);
		cursor: default;
	}

	/* Woven lattice pattern on the card back, framed by an inner border */
	.back-inner {
		position: absolute;
		inset: 9%;
		border: 1px solid rgba(240, 230, 211, 0.45);
		border-radius: calc(var(--card-radius) * 0.6);
		background-image:
			repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.13) 0 2px, transparent 2px 7px),
			repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.13) 0 2px, transparent 2px 7px);
	}

	.corner {
		position: absolute;
		font-size: calc(var(--card-w) * 0.24);
		line-height: 1.05;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.top-left {
		top: 5%;
		left: 8%;
	}

	.bottom-right {
		bottom: 5%;
		right: 8%;
		transform: rotate(180deg);
	}

	.center-suit {
		font-size: calc(var(--card-w) * 0.44);
		line-height: 1;
		opacity: 0.9;
	}

	.rank {
		font-size: calc(var(--card-w) * 0.24);
		font-weight: bold;
		line-height: 1;
	}

	.suit {
		font-size: calc(var(--card-w) * 0.2);
		line-height: 1;
	}

	.red {
		color: var(--suit-red);
	}

	.black {
		color: var(--suit-black);
	}
</style>
