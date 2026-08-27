<script lang="ts">
	import CardComponent from './Card.svelte';
	import PlayerBadge from './PlayerBadge.svelte';
	import { t } from '$lib/i18n';
	import type { Trick, Player, Card, Contract, Bid, WhistChoice } from '$lib/types/preferans';

	interface Props {
		trick: Trick | null;
		players: Player[];
		myPlayerId: string;
		trump?: import('$lib/types/preferans').Suit | null;
		currentPlayerId?: string | null;
		currentContract?: Contract | null;
		declarerId?: string | null;
		bulletTarget?: number | null;
		bids?: { playerId: string; bid: Bid }[];
		whistDeclarations?: { playerId: string; choice: WhistChoice }[];
		phase?: string;
		completedTricks?: Trick[];
		/** Player who leads next round (shown with a special marker) */
		nextRoundLeaderId?: string | null;
	}

	let {
		trick,
		players,
		myPlayerId,
		trump = null,
		currentPlayerId = null,
		currentContract = null,
		declarerId = null,
		bulletTarget = null,
		bids = [],
		whistDeclarations = [],
		phase = '',
		completedTricks = [],
		nextRoundLeaderId = null
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

	/** Last bid made by this player during the bidding phase */
	function getLastBid(playerId: string): Bid | null {
		const playerBids = bids.filter((b) => b.playerId === playerId);
		return playerBids.length > 0 ? playerBids[playerBids.length - 1].bid : null;
	}

	/** Whist declaration made by this player */
	function getWhistDeclaration(playerId: string): WhistChoice | null {
		return whistDeclarations.find((d) => d.playerId === playerId)?.choice ?? null;
	}

	/** How many tricks this player has taken in the current round */
	function getTrickCount(playerId: string): number {
		return completedTricks.filter((t) => t.winnerId === playerId).length;
	}

	function formatBidLabel(bid: Bid): string {
		if (bid === 'pass') return $t('app.table.bidPass');
		if (bid.type === 'misere') return $t('app.game.misere');
		return `${bid.level}${bid.suit === 'no_trump' ? $t('app.game.noTrumpShort') : SUIT_SYMBOLS[bid.suit]}`;
	}

	function formatWhistLabel(choice: WhistChoice): string {
		return $t(`app.game.whistChoice.${choice}`);
	}

	// Sort players by their relative position so that position 0 (self/bottom)
	// is always rendered first, followed by position 1 (left) and 2 (right).
	// This ensures :nth-child(1/2/3) CSS selectors always map to the correct seat.
	let sortedPlayers = $derived([...players].sort((a, b) => a.position - b.position));

	function contractSuitClass(contract: Contract | null): string {
		if (!contract) return '';
		if (contract.type === 'misere') return '';
		if (contract.suit === 'no_trump') return 'suit-nt';
		if (contract.suit === 'diamonds' || contract.suit === 'hearts') return 'suit-red';
		if (contract.suit === 'spades' || contract.suit === 'clubs') return 'suit-black';
		return '';
	}

	function formatCenterContract(contract: Contract | null): string {
		if (!contract) return '';
		if (contract.type === 'misere') return $t('app.game.misere');
		return `${contract.level}${contract.suit === 'no_trump' ? $t('app.game.noTrumpShort') : SUIT_SYMBOLS[contract.suit]}`;
	}

	function bidSuitClass(bid: Bid): string {
		if (bid === 'pass') return 'bid-pass';
		if (bid.type === 'misere') return 'bid-misere';
		if (bid.suit === 'no_trump') return 'suit-nt';
		if (bid.suit === 'diamonds' || bid.suit === 'hearts') return 'suit-red';
		if (bid.suit === 'spades' || bid.suit === 'clubs') return 'suit-black';
		return '';
	}
</script>

<div class="table" aria-label={$t('app.table.aria')}>
	{#if bulletTarget !== null}
		<div
			class="bullet-target-indicator"
			aria-label={`${$t('app.game.bulletTarget')}: ${bulletTarget}`}
		>
			<span class="bullet-target-value">{bulletTarget}</span>
		</div>
	{/if}

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

	{#if currentContract && phase !== 'bidding'}
		{@const centerContractClass = contractSuitClass(currentContract)}
		<div class="center-contract-display {centerContractClass}" aria-label={$t('app.game.contract')}>
			{formatCenterContract(currentContract)}
		</div>
	{/if}

	<div class="table-center">
		{#each sortedPlayers as player}
			{@const card = getCardForPlayer(player.id)}
			{@const lastBid = phase === 'bidding' ? getLastBid(player.id) : null}
			{@const whistDecl =
				phase === 'whisting' || phase === 'playing' ? getWhistDeclaration(player.id) : null}
			{@const trickCount = getTrickCount(player.id)}
			<div
				class="player-slot"
				class:self={player.id === myPlayerId}
				class:current-turn={player.id === currentPlayerId}
				class:next-round-leader={player.id === nextRoundLeaderId && player.id !== currentPlayerId}
				style="--pos: {player.position}"
			>
				<div class="player-name">
					<PlayerBadge
						playerId={player.id}
						name={player.name}
						offline={player.isOnline === false}
					/>
					{#if player.id === nextRoundLeaderId}
						<span class="next-lead-marker" title={$t('app.table.leadsNext')}>▶</span>
					{/if}
					{#if player.id === declarerId && currentContract && phase !== 'bidding'}
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
					{#if lastBid !== null}
						<span class={`bid-label ${bidSuitClass(lastBid)}`}>
							{formatBidLabel(lastBid)}
						</span>
					{/if}
					{#if whistDecl !== null}
						<span class="whist-label whist-{whistDecl}">
							{formatWhistLabel(whistDecl)}
						</span>
					{/if}
				</div>
				{#if trickCount > 0}
					<div class="tricks-taken" aria-label={$t('app.table.tricksTaken', { count: trickCount })}>
						{#each Array(trickCount) as _, i (i)}
							<div class="trick-tile"></div>
						{/each}
					</div>
				{/if}
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
		/* Portrait defaults: wider relative to height for a landscape-leaning table */
		--table-width: 420px;
		--table-height: 280px;
		--table-max-height: 60dvh;

		position: relative;
		width: min(var(--table-width), 100%);
		height: min(var(--table-height), var(--table-max-height));
		background: radial-gradient(ellipse at center, #2d6a4f 0%, #1b4332 100%);
		border-radius: 16px;
		border: 4px solid #c8a96e;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto;
	}

	/* Landscape: use more available horizontal space */
	@media (orientation: landscape) {
		.table {
			--table-width: min(55vw, 560px);
			--table-height: min(40vh, 340px);
		}
	}

	/* Portrait: narrower viewport – keep width bounded */
	@media (orientation: portrait) {
		.table {
			--table-width: min(98vw, 420px);
			--table-height: min(45vw, 300px);
		}
	}

	.bullet-target-indicator {
		position: absolute;
		top: -18px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		padding: 6px 12px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid rgba(200, 169, 110, 0.45);
		color: #f0e6d3;
		white-space: nowrap;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
	}

	.bullet-target-value {
		font-size: 18px;
		font-weight: 800;
		color: #ffd700;
		line-height: 1;
	}

	.center-contract-display {
		position: absolute;
		top: 14%;
		left: 50%;
		transform: translateX(-50%);
		font-size: 18px;
		font-weight: 800;
		line-height: 1;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #f0e6d3;
		white-space: nowrap;
		pointer-events: none;
		z-index: 1;
	}

	.center-contract-display.suit-black {
		color: #111;
		background: rgba(255, 255, 255, 0.92);
		border-color: rgba(0, 0, 0, 0.2);
	}

	.center-contract-display.suit-red {
		color: #c0392b;
		background: rgba(255, 255, 255, 0.92);
		border-color: rgba(192, 57, 43, 0.3);
	}

	.center-contract-display.suit-nt {
		color: #ffd700;
		border-color: rgba(255, 215, 0, 0.5);
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

	.bid-label {
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		padding: 2px 5px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(200, 169, 110, 0.5);
		color: #c8a96e;
	}

	.bid-label.bid-pass {
		color: #aaa;
		border-color: rgba(170, 170, 170, 0.4);
	}

	.bid-label.bid-misere {
		color: #ff6b6b;
		border-color: rgba(255, 107, 107, 0.5);
		background: rgba(139, 0, 0, 0.3);
	}

	.whist-label {
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		padding: 2px 5px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.whist-label.whist-whist {
		color: #c8a96e;
		border-color: rgba(200, 169, 110, 0.5);
	}

	.whist-label.whist-pass {
		color: #aaa;
		border-color: rgba(170, 170, 170, 0.4);
	}

	.whist-label.whist-half_whist {
		color: #ffb347;
		border-color: rgba(255, 179, 71, 0.5);
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
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(255, 215, 0, 0.92);
		color: #1a1a2e;
		padding: 4px 12px;
		border-radius: 20px;
		font-weight: bold;
		font-size: 13px;
		white-space: nowrap;
		animation: fadeIn 0.3s ease;
		z-index: 10;
		pointer-events: none;
	}

	.tricks-taken {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: 2px;
		max-width: 64px;
		justify-content: center;
	}

	.trick-tile {
		width: 14px;
		height: 20px;
		border-radius: 3px;
		background: linear-gradient(135deg, #1a3c5e 25%, #2563a8 50%, #1a3c5e 75%);
		border: 1px solid #c8a96e;
		flex-shrink: 0;
	}

	.next-lead-marker {
		font-size: 10px;
		color: #ffd700;
		line-height: 1;
	}

	.player-slot.next-round-leader .player-name {
		border: 1px solid rgba(255, 215, 0, 0.5);
		background: rgba(255, 215, 0, 0.08);
		color: #ffd700;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translate(-50%, calc(-50% + 8px));
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%);
		}
	}

	@media (max-width: 480px) {
		.table {
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
