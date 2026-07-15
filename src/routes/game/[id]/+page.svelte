<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { game, myHand, currentTrick, gamePhase } from '$lib/stores/game';
	import Hand from '$lib/components/Hand.svelte';
	import Table from '$lib/components/Table.svelte';
	import Scoreboard from '$lib/components/Scoreboard.svelte';
	import BiddingPanel from '$lib/components/BiddingPanel.svelte';
	import PlayerBadge from '$lib/components/PlayerBadge.svelte';
	import { t } from '$lib/i18n';
	import { contractValue } from '$lib/types/preferans';
	import { sortHand } from '$lib/utils/cards';
	import type { PageData } from './$types';
	import type {
		Card,
		Bid,
		Contract,
		ContractLevel,
		ContractSuit,
		Suit,
		WhistChoice
	} from '$lib/types/preferans';

	let { data }: { data: PageData } = $props();

	let selectedCard: Card | null = $state(null);
	let tableAgeSeconds = $state(0);
	let tableTimer: ReturnType<typeof setInterval> | null = null;
	/** Track whether a finishProposal was active so we can redirect on approval. */
	let hadFinishProposal = $state(false);
	/** Show the lobby-redirect countdown message after approved finish. */
	let redirectingToLobby = $state(false);

	/** Delay (ms) before redirecting to lobby after an approved early-finish vote. */
	const REDIRECT_DELAY_MS = 3000;

	const SUIT_SYMBOLS: Record<string, string> = {
		spades: '♠',
		clubs: '♣',
		diamonds: '♦',
		hearts: '♥'
	};

	function suitSymbol(suit: ContractSuit): string {
		return suit === 'no_trump' ? $t('app.game.noTrumpShort') : SUIT_SYMBOLS[suit];
	}

	function formatContract(contract: Contract | null): string {
		if (!contract) return '';
		if (contract.type === 'misere') return $t('app.game.misere');
		return `${contract.level} ${suitSymbol(contract.suit)}`;
	}

	function updateTableAge() {
		const createdAt = Date.parse(data.createdAt);
		const hasValidCreatedAt = !Number.isNaN(createdAt) && createdAt > 0 && createdAt <= Date.now();
		tableAgeSeconds = hasValidCreatedAt
			? Math.max(0, Math.floor((Date.now() - createdAt) / 1000))
			: 0;
	}

	function formatElapsed(seconds: number) {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		return [hours, minutes, secs].map((value) => value.toString().padStart(2, '0')).join(':');
	}

	onMount(() => {
		game.connect(data.gameId, data.sessionToken);
		updateTableAge();
		tableTimer = setInterval(updateTableAge, 1000);
	});

	onDestroy(() => {
		if (tableTimer) {
			clearInterval(tableTimer);
		}
		game.disconnect();
	});

	let isMyTurn = $derived($game.state?.currentPlayerId === data.user?.id);
	let myPlayerId = $derived(data.user?.id ?? '');
	let tableCurrentContract = $derived($game.state?.contract ?? $game.state?.wonBid ?? null);
	let finishProposal = $derived($game.state?.finishProposal ?? null);
	let pauseProposal = $derived($game.state?.pauseProposal ?? null);
	// Backend enforces mutual exclusion (only one proposal can be active at a time).
	let activeProposal = $derived(finishProposal ?? pauseProposal);
	let isProposalProposer = $derived(activeProposal?.proposedBy === myPlayerId);
	let hasPendingVote = $derived(activeProposal ? activeProposal.votes[myPlayerId] === null : false);

	let lightDecisionPending = $derived($game.state?.lightDecisionBy ?? null);
	let canPlayCard = $derived($gamePhase === 'playing' && isMyTurn && !lightDecisionPending);
	let isDeclarer = $derived($game.state?.declarerId === myPlayerId);

	// ── Sorted hand derived state ──
	let sortedHand = $derived(sortHand($myHand));

	// ── Open hands organised by relative position ──
	// Key = playerId, value = sorted cards. We sort each open hand too.
	let sortedOpenHands = $derived(
		Object.fromEntries(
			Object.entries($game.state?.openHands ?? {}).map(([pid, cards]) => [pid, sortHand(cards)])
		)
	);

	// Pre-compute the open-hand layout so we don't re-filter in the template.
	let openHandEntries = $derived(Object.entries(sortedOpenHands));
	let openHandLeftPlayer = $derived(
		$game.state?.players.find(
			(p) => p.id !== myPlayerId && openHandEntries.some(([id]) => id === p.id) && p.position === 1
		) ?? null
	);
	let openHandRightPlayer = $derived(
		$game.state?.players.find(
			(p) => p.id !== myPlayerId && openHandEntries.some(([id]) => id === p.id) && p.position === 2
		) ?? null
	);
	let openHandOthers = $derived(
		openHandEntries.filter(
			([id]) => id !== openHandLeftPlayer?.id && id !== openHandRightPlayer?.id
		)
	);

	// ── Widow (discard + final contract) state ──
	let discardSelection: Card[] = $state([]);
	let declaredLevel: ContractLevel = $state(6);
	let declaredSuit: ContractSuit = $state('spades');

	let combinedWidowHand = $derived(
		$gamePhase === 'widow' && isDeclarer
			? sortHand([...$myHand, ...($game.state?.widow ?? [])])
			: []
	);
	let wonBid = $derived($game.state?.wonBid ?? null);
	let misereBid = $derived(wonBid?.type === 'misere');
	let declaredContract: Contract = $derived(
		misereBid ? { type: 'misere' } : { type: 'suit', level: declaredLevel, suit: declaredSuit }
	);
	let declarationValid = $derived(
		misereBid || (wonBid !== null && contractValue(declaredContract) >= contractValue(wonBid))
	);

	$effect(() => {
		// Track whether a finish proposal has ever been active this session
		if (finishProposal) hadFinishProposal = true;
	});

	$effect(() => {
		// Redirect to lobby after an early finish vote is approved
		if ($gamePhase === 'finished' && hadFinishProposal) {
			redirectingToLobby = true;
			setTimeout(() => goto('/'), REDIRECT_DELAY_MS);
		}
	});

	$effect(() => {
		// Preselect the winning bid as the announced contract
		if (wonBid && wonBid.type === 'suit') {
			declaredLevel = wonBid.level;
			declaredSuit = wonBid.suit;
		}
	});

	function sameCard(a: Card, b: Card): boolean {
		return a.suit === b.suit && a.rank === b.rank;
	}

	function toggleDiscard(card: Card) {
		const idx = discardSelection.findIndex((c) => sameCard(c, card));
		if (idx >= 0) {
			discardSelection = discardSelection.filter((_, i) => i !== idx);
		} else if (discardSelection.length < 2) {
			discardSelection = [...discardSelection, card];
		}
	}

	function confirmWidow() {
		if (discardSelection.length !== 2 || !declarationValid) return;
		game.send({
			type: 'select_widow',
			discard: [discardSelection[0], discardSelection[1]],
			contract: declaredContract
		});
		discardSelection = [];
	}

	function handlePlayCard(card: Card) {
		if ($gamePhase === 'widow' && isDeclarer) {
			toggleDiscard(card);
			return;
		}
		if (!canPlayCard) return;
		if (selectedCard && sameCard(selectedCard, card)) {
			// Second click confirms the card play
			game.send({ type: 'play_card', card });
			selectedCard = null;
		} else {
			selectedCard = card;
		}
	}

	function handleBid(bid: Bid) {
		game.send({ type: 'bid', bid });
	}

	function handleWhist(choice: WhistChoice) {
		game.send({ type: 'whist', choice });
	}

	function chooseOpen(open: boolean) {
		game.send({ type: 'choose_open', open });
	}

	function startNextRound() {
		game.send({ type: 'start_round' });
	}

	function isDiscardSelected(card: Card): boolean {
		return discardSelection.some((c) => sameCard(c, card));
	}

	function playerName(playerId: string | null): string {
		if (!playerId) return '';
		return $game.state?.players.find((p) => p.id === playerId)?.name ?? '';
	}

	function proposeFinishEarly() {
		game.send({ type: 'request_finish_early' });
	}

	function proposePause(durationMinutes: number | null) {
		game.send({ type: 'request_pause', durationMinutes });
	}

	function voteOnProposal(approve: boolean) {
		if (finishProposal) {
			game.send({ type: 'vote_finish_early', approve });
			return;
		}
		if (pauseProposal) {
			game.send({ type: 'vote_pause', approve });
		}
	}
</script>

<svelte:head>
	<title>{$t('app.game.title')}</title>
</svelte:head>

<div class="game-page">
	<!-- Status bar -->
	<div class="status-bar">
		<span class="connection-status">{$t(`app.game.status.${$game.status}`)}</span>
		<span class="table-stat">{$t('app.game.tableAge')}: {formatElapsed(tableAgeSeconds)}</span>
		<span class="table-stat">{$t('app.game.bulletTarget')}: {data.bulletTarget}</span>
		{#if $game.state}
			<span class="phase-label">{$t(`app.phase.${$gamePhase}`)}</span>
			{#if $game.state.trump}
				<span class="trump-label suit-symbol {`suit-${$game.state.trump}`}">
					{$t('app.game.trump')}: {$game.state.trump === 'spades'
						? '♠'
						: $game.state.trump === 'clubs'
							? '♣'
							: $game.state.trump === 'diamonds'
								? '♦'
								: '♥'}
				</span>
			{/if}
		{/if}
		{#if $game.error}
			<span class="error-msg" role="alert">{$game.error}</span>
		{/if}
	</div>

	{#if $game.state && $gamePhase !== 'waiting' && $gamePhase !== 'finished'}
		<div class="governance-actions">
			<button
				type="button"
				class="governance-btn"
				onclick={proposeFinishEarly}
				disabled={Boolean(activeProposal)}
				aria-disabled={Boolean(activeProposal)}
			>
				{$t('app.game.suggestFinishEarly')}
			</button>
			{#if $gamePhase !== 'paused'}
				<button
					type="button"
					class="governance-btn"
					onclick={() => proposePause(60)}
					disabled={Boolean(activeProposal)}
					aria-disabled={Boolean(activeProposal)}
				>
					{$t('app.game.suggestPauseHour')}
				</button>
				<button
					type="button"
					class="governance-btn"
					onclick={() => proposePause(null)}
					disabled={Boolean(activeProposal)}
					aria-disabled={Boolean(activeProposal)}
				>
					{$t('app.game.suggestPauseIndefinite')}
				</button>
			{/if}
		</div>
	{/if}

	<!-- Finish-early modal – blocks the table until all players vote -->
	{#if finishProposal}
		{@const proposerName =
			$game.state?.players.find((p) => p.id === finishProposal.proposedBy)?.name ?? ''}
		<div
			class="modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-labelledby="finish-modal-title"
		>
			<div class="modal-card">
				<h2 id="finish-modal-title" class="modal-title">
					{$t('app.game.finishEarlyModalTitle')}
				</h2>
				<p class="modal-body">
					{$t('app.game.finishEarlyModalBody', { name: proposerName })}
				</p>
				<!-- Show each player's vote status -->
				<ul class="vote-list">
					{#each $game.state?.players ?? [] as player}
						{@const vote = finishProposal.votes[player.id]}
						<li class="vote-item" class:vote-yes={vote === 'yes'} class:vote-no={vote === 'no'}>
							<PlayerBadge playerId={player.id} name={player.name} />
							<span class="vote-badge">
								{vote === 'yes' ? '✓' : vote === 'no' ? '✗' : '…'}
							</span>
						</li>
					{/each}
				</ul>
				{#if hasPendingVote && !isProposalProposer}
					<div class="modal-actions">
						<button type="button" class="vote-btn yes" onclick={() => voteOnProposal(true)}>
							{$t('app.game.voteYes')}
						</button>
						<button type="button" class="vote-btn no" onclick={() => voteOnProposal(false)}>
							{$t('app.game.voteNo')}
						</button>
					</div>
				{:else if isProposalProposer}
					<p class="modal-waiting">{$t('app.game.proposalBy', { name: proposerName })}</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Pause proposal banner (less intrusive – game is already paused or mid-round) -->
	{#if pauseProposal}
		<div class="proposal-banner" role="status">
			<p>
				{$t('app.game.proposalBy', {
					name: $game.state?.players.find((p) => p.id === pauseProposal.proposedBy)?.name ?? ''
				})}
			</p>
			{#if hasPendingVote && !isProposalProposer}
				<div class="proposal-actions">
					<button type="button" class="vote-btn yes" onclick={() => voteOnProposal(true)}>
						{$t('app.game.voteYes')}
					</button>
					<button type="button" class="vote-btn no" onclick={() => voteOnProposal(false)}>
						{$t('app.game.voteNo')}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if $gamePhase === 'paused'}
		{@const pausedUntil = $game.state?.pausedUntil ?? null}
		<div class="proposal-banner" role="status">
			{#if pausedUntil !== null}
				<p>
					{$t('app.game.pausedUntil', { time: new Date(pausedUntil).toLocaleString() })}
				</p>
			{:else}
				<p>{$t('app.game.pausedIndefinitely')}</p>
			{/if}
		</div>
	{/if}

	<!-- Main game area -->
	<div class="game-area">
		<!-- Sidebar: scoreboard -->
		<aside class="sidebar">
			{#if $game.state}
				<Scoreboard
					pool={$game.state.pool}
					mountain={$game.state.mountain}
					whists={$game.state.whists}
					scores={$game.state.scores}
					players={$game.state.players}
					roundNumber={$game.state.roundNumber}
					bulletTarget={$game.state.bulletTarget}
				/>

				<!-- Contract info -->
				{#if $game.state.raspass}
					<div class="contract-info">
						<h4>{$t('app.game.contract')}</h4>
						<p>{$t('app.game.raspass')}</p>
						<p class="declarer">
							{$t('app.game.raspassPrice', { price: $game.state.raspassPrice })}
						</p>
					</div>
				{:else if $game.state.contract}
					<div class="contract-info">
						<h4>{$t('app.game.contract')}</h4>
						<p>{formatContract($game.state.contract)}</p>
						{#if $game.state.declarerId}
							<p class="declarer">
								{$t('app.game.declarer', { name: playerName($game.state.declarerId) })}
							</p>
						{/if}
						{#if $game.state.whisters.length > 0}
							<p>
								{$t('app.game.whisters', {
									names: $game.state.whisters.map((id) => playerName(id)).join(', ')
								})}
								{#if $game.state.playedOpen}
									· {$t('app.game.openPlay')}
								{/if}
							</p>
						{/if}
					</div>
				{:else if $game.state.wonBid && $game.state.declarerId}
					<div class="contract-info">
						<h4>{$t('app.game.contract')}</h4>
						<p>{formatContract($game.state.wonBid)}</p>
						<p class="declarer">
							{$t('app.game.declarer', { name: playerName($game.state.declarerId) })}
						</p>
					</div>
				{/if}
			{/if}
		</aside>

		<!-- Center: table + hand -->
		<div class="center-area">
			{#if $game.status === 'connecting'}
				<div class="connecting-msg">
					<div class="spinner" aria-label={$t('app.game.loadingAria')}></div>
					<p>{$t('app.game.connecting')}</p>
				</div>
			{:else if !$game.state || $gamePhase === 'waiting'}
				<div class="waiting-shell">
					{#if data.isPlayer}
						<form method="POST" action="?/leaveTable" class="leave-table-form">
							<button type="submit" class="leave-table-btn">{$t('app.game.leaveTable')}</button>
						</form>
					{/if}
					<div class="waiting-msg">
						<span class="waiting-icon">⏳</span>
						<p>{$t('app.game.waitingPlayers', { count: $game.state?.players.length ?? 0 })}</p>
					</div>
				</div>
			{:else}
				<!-- Playing table and side open hands -->
				<div class="table-layout">
					{#if openHandLeftPlayer && sortedOpenHands[openHandLeftPlayer.id]}
						<div class="open-hand open-hand-side open-hand-left">
							<h4>{$t('app.game.openHandOf', { name: openHandLeftPlayer.name })}</h4>
							<Hand
								cards={sortedOpenHands[openHandLeftPlayer.id]}
								playable={false}
								label={openHandLeftPlayer.name}
							/>
						</div>
					{/if}

					<div class="table-center-column">
						<Table
							trick={$currentTrick}
							players={$game.state.players}
							myPlayerId={data.user?.id ?? ''}
							trump={$game.state.trump}
							currentPlayerId={$game.state.currentPlayerId}
							currentContract={tableCurrentContract}
						/>

						{#if $game.state.raspass && $game.state.raspassUpcard}
							<div class="raspass-banner" role="status">
								<span>
									{$t('app.game.raspassLead', {
										suit: SUIT_SYMBOLS[$game.state.raspassUpcard.suit]
									})}
								</span>
								<Hand
									cards={[$game.state.raspassUpcard]}
									playable={false}
									label={$t('app.game.widow')}
								/>
							</div>
						{/if}
					</div>

					{#if openHandRightPlayer && sortedOpenHands[openHandRightPlayer.id]}
						<div class="open-hand open-hand-side open-hand-right">
							<h4>{$t('app.game.openHandOf', { name: openHandRightPlayer.name })}</h4>
							<Hand
								cards={sortedOpenHands[openHandRightPlayer.id]}
								playable={false}
								label={openHandRightPlayer.name}
							/>
						</div>
					{/if}
				</div>

				{#if openHandOthers.length > 0}
					<div class="open-hands-others">
						{#each openHandOthers as [playerId, cards] (playerId)}
							<div class="open-hand">
								<h4>{$t('app.game.openHandOf', { name: playerName(playerId) })}</h4>
								<Hand {cards} playable={false} label={playerName(playerId)} />
							</div>
						{/each}
					</div>
				{/if}

				<!-- Widow: declarer discards two cards and announces the contract -->
				{#if $gamePhase === 'widow' && isDeclarer}
					<div class="widow-area">
						<h3>{$t('app.game.widowTitle')}</h3>
						<p class="widow-hint">{$t('app.game.widowHint')}</p>
						{#if !misereBid}
							<div class="declare-row">
								<span>{$t('app.game.announceContract')}</span>
								{#each [6, 7, 8, 9, 10] as level}
									<button
										class="mini-btn"
										class:active={declaredLevel === level}
										onclick={() => (declaredLevel = level as ContractLevel)}
									>
										{level}
									</button>
								{/each}
								{#each ['spades', 'clubs', 'diamonds', 'hearts', 'no_trump'] as suit}
									<button
										class="mini-btn"
										class:black={suit === 'spades' || suit === 'clubs'}
										class:red={suit === 'diamonds' || suit === 'hearts'}
										class:nt={suit === 'no_trump'}
										class:active={declaredSuit === suit}
										onclick={() => (declaredSuit = suit as ContractSuit)}
									>
										{suitSymbol(suit as ContractSuit)}
									</button>
								{/each}
							</div>
							{#if !declarationValid}
								<p class="widow-warning">
									{$t('app.game.contractTooLow', { bid: formatContract(wonBid) })}
								</p>
							{/if}
						{:else}
							<p>{$t('app.game.misereStays')}</p>
						{/if}
						<button
							class="confirm-btn"
							disabled={discardSelection.length !== 2 || !declarationValid}
							onclick={confirmWidow}
						>
							{$t('app.game.confirmDiscard', { count: discardSelection.length })}
						</button>
					</div>
				{/if}

				<!-- Whisting panel -->
				{#if $gamePhase === 'whisting' && $game.state.whistOptions}
					<div class="whist-panel">
						<h3>{$t('app.game.whistTitle', { contract: formatContract($game.state.contract) })}</h3>
						<div class="whist-actions">
							{#each $game.state.whistOptions as choice}
								<button class="whist-btn {choice}" onclick={() => handleWhist(choice)}>
									{$t(`app.game.whistChoice.${choice}`)}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Light/dark decision («первый ход втемную») -->
				{#if lightDecisionPending}
					{#if lightDecisionPending === myPlayerId}
						<div class="whist-panel">
							<h3>{$t('app.game.lightChoiceTitle')}</h3>
							<div class="whist-actions">
								<button class="whist-btn whist" onclick={() => chooseOpen(true)}>
									{$t('app.game.playLight')}
								</button>
								<button class="whist-btn pass" onclick={() => chooseOpen(false)}>
									{$t('app.game.playDark')}
								</button>
							</div>
						</div>
					{:else}
						<div class="turn-indicator" role="status">
							{$t('app.game.awaitingLightChoice', { name: playerName(lightDecisionPending) })}
						</div>
					{/if}
				{/if}

				<!-- Bidding panel -->
				{#if $gamePhase === 'bidding' && isMyTurn}
					{@const nonPassBids = $game.state.bids.filter((b) => b.bid !== 'pass')}
					{@const highBid = nonPassBids.reduce<Contract | null>(
						(best, b) =>
							!best || contractValue(b.bid as Contract) > contractValue(best)
								? (b.bid as Contract)
								: best,
						null
					)}
					{@const canMisere = !$game.state.bids.some(
						(b) => b.playerId === myPlayerId && b.bid !== 'pass'
					)}
					<div class="bidding-area">
						<BiddingPanel
							currentHighBid={highBid}
							myTurn={isMyTurn}
							{canMisere}
							onBid={handleBid}
						/>
					</div>
				{/if}

				<!-- Round summary -->
				{#if ($gamePhase === 'scoring' || $gamePhase === 'finished') && $game.state.roundSummary}
					{@const summary = $game.state.roundSummary}
					<div class="round-summary" role="status">
						<h3>
							{$gamePhase === 'finished'
								? $t('app.game.gameOver')
								: $t('app.game.roundOver', { roundNumber: summary.roundNumber })}
						</h3>
						{#if summary.raspass}
							<p>{$t('app.game.raspassResult')}</p>
						{:else if !summary.played}
							<p>
								{$t('app.game.thrownIn', {
									name: playerName(summary.declarerId),
									contract: formatContract(summary.contract)
								})}
							</p>
						{:else}
							<p>
								{$t(summary.success ? 'app.game.contractMade' : 'app.game.contractFailed', {
									name: playerName(summary.declarerId),
									contract: formatContract(summary.contract),
									tricks: summary.declarerId ? (summary.tricksTaken[summary.declarerId] ?? 0) : 0
								})}
							</p>
						{/if}
						<ul class="summary-tricks">
							{#each $game.state.players as player}
								<li>
									{player.name}: {$t('app.game.tricksTaken', {
										count: summary.tricksTaken[player.id] ?? 0
									})}
								</li>
							{/each}
						</ul>
						{#if $gamePhase === 'scoring'}
							<button class="confirm-btn" onclick={startNextRound}>
								{$t('app.game.nextRound')}
							</button>
						{/if}
					</div>
				{/if}

				<!-- Turn indicator -->
				{#if !lightDecisionPending}
					{#if $game.state.currentPlayerId && $game.state.currentPlayerId !== data.user?.id}
						<div class="turn-indicator" role="status">
							{$t('app.game.turn', { name: playerName($game.state.currentPlayerId) })}
						</div>
					{:else if isMyTurn && $gamePhase === 'playing'}
						<div class="turn-indicator my-turn" role="status">{$t('app.game.yourTurn')}</div>
					{/if}
				{/if}
			{/if}

			<!-- Player hand -->
			{#if $gamePhase === 'widow' && isDeclarer}
				<div class="my-hand">
					<Hand
						cards={combinedWidowHand}
						playable={true}
						selectedCard={null}
						onPlayCard={handlePlayCard}
						label={$t('app.game.yourCards')}
					/>
					<p class="play-hint">
						{$t('app.game.discardSelected', {
							cards: discardSelection.map((c) => `${c.rank}${SUIT_SYMBOLS[c.suit]}`).join(', ')
						})}
					</p>
				</div>
			{:else if sortedHand.length > 0}
				<div class="my-hand">
					<Hand
						cards={sortedHand}
						playable={canPlayCard}
						{selectedCard}
						onPlayCard={handlePlayCard}
						label={$t('app.game.yourCards')}
					/>
					{#if canPlayCard && selectedCard}
						<p class="play-hint">{$t('app.game.playHint')}</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Lobby redirect notice after early finish -->
	{#if redirectingToLobby}
		<div class="redirect-notice" role="status">
			{$t('app.game.redirectingToLobby')}
		</div>
	{/if}
</div>

<style>
	.game-page {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-height: min(100%, calc(100dvh - 170px));
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 16px;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 8px;
		font-size: 13px;
		flex-wrap: wrap;
	}

	.governance-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.governance-btn {
		border: 1px solid rgba(200, 169, 110, 0.35);
		background: rgba(200, 169, 110, 0.12);
		color: #f0e6d3;
		border-radius: 999px;
		padding: 8px 14px;
		font-size: 13px;
		cursor: pointer;
	}

	.governance-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.proposal-banner {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 12px;
		padding: 10px 14px;
		color: #f0e6d3;
		display: grid;
		gap: 8px;
	}

	.proposal-banner p {
		margin: 0;
	}

	.proposal-actions {
		display: flex;
		gap: 8px;
	}

	.vote-btn {
		border-radius: 8px;
		border: 1px solid transparent;
		padding: 6px 10px;
		font-size: 13px;
		cursor: pointer;
	}

	.vote-btn.yes {
		background: rgba(46, 204, 113, 0.16);
		border-color: rgba(46, 204, 113, 0.5);
		color: #b7f7d0;
	}

	.vote-btn.no {
		background: rgba(255, 107, 107, 0.14);
		border-color: rgba(255, 107, 107, 0.5);
		color: #ffd2d2;
	}

	.phase-label {
		color: #ffd700;
		font-weight: bold;
	}

	.trump-label {
		color: #c8a96e;
	}

	.suit-symbol.suit-spades,
	.suit-symbol.suit-clubs {
		color: #111;
		background: rgba(255, 255, 255, 0.9);
		border-radius: 999px;
		padding: 2px 8px;
	}

	.suit-symbol.suit-diamonds,
	.suit-symbol.suit-hearts {
		color: #c0392b;
		background: rgba(255, 255, 255, 0.9);
		border-radius: 999px;
		padding: 2px 8px;
	}

	.error-msg {
		color: #ff6b6b;
		margin-left: auto;
	}

	.game-area {
		display: flex;
		gap: 24px;
		align-items: flex-start;
		justify-content: center;
	}

	.sidebar {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.contract-info {
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 8px;
		padding: 12px;
		color: #f0e6d3;
		font-size: 14px;
	}

	.contract-info h4 {
		margin: 0 0 8px;
		color: #c8a96e;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.contract-info p {
		margin: 4px 0;
	}

	.declarer {
		color: #ffd700;
		font-style: italic;
	}

	.center-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		width: 100%;
		max-height: calc(100dvh - 220px);
		overflow-y: auto;
	}

	.table-stat {
		color: #c0b090;
	}

	.connecting-msg,
	.waiting-msg {
		text-align: center;
		padding: 48px;
		color: #c0b090;
	}

	.waiting-shell {
		display: grid;
		gap: 16px;
		width: min(100%, 520px);
	}

	.leave-table-form {
		display: flex;
		justify-content: center;
	}

	.leave-table-btn {
		border: 1px solid rgba(255, 107, 107, 0.35);
		background: rgba(255, 107, 107, 0.12);
		color: #ffd2d2;
		border-radius: 999px;
		padding: 10px 18px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.waiting-icon,
	.connecting-msg {
		font-size: 48px;
		display: block;
		margin-bottom: 12px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(200, 169, 110, 0.2);
		border-top-color: #c8a96e;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 16px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.widow-area {
		text-align: center;
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 10px;
		padding: 12px 16px;
		color: #f0e6d3;
	}

	.widow-area h3 {
		color: #c8a96e;
		margin: 0 0 8px;
	}

	.widow-hint {
		font-size: 13px;
		color: #c0b090;
		margin: 0 0 8px;
	}

	.widow-warning {
		font-size: 13px;
		color: #ff6b6b;
		margin: 4px 0;
	}

	.declare-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		justify-content: center;
		margin-bottom: 8px;
		font-size: 13px;
	}

	.mini-btn {
		min-width: 32px;
		height: 32px;
		border: 1px solid #c8a96e;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.05);
		color: #f0e6d3;
		font-size: 14px;
		cursor: pointer;
	}

	.mini-btn.active {
		background: rgba(200, 169, 110, 0.3);
		border-color: #ffd700;
		color: #ffd700;
	}

	.mini-btn.red {
		color: #e74c3c;
	}

	.confirm-btn {
		padding: 8px 18px;
		border-radius: 6px;
		border: none;
		background: #c8a96e;
		color: #1a1a2e;
		font-weight: bold;
		font-size: 14px;
		cursor: pointer;
	}

	.confirm-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.whist-panel {
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid #c8a96e;
		border-radius: 10px;
		padding: 14px 20px;
		color: #f0e6d3;
		text-align: center;
	}

	.whist-panel h3 {
		margin: 0 0 12px;
		font-size: 14px;
		color: #ffd700;
	}

	.whist-actions {
		display: flex;
		gap: 8px;
		justify-content: center;
		flex-wrap: wrap;
	}

	.whist-btn {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 14px;
		cursor: pointer;
		border: none;
	}

	.whist-btn.whist {
		background: #c8a96e;
		color: #1a1a2e;
		font-weight: bold;
	}

	.whist-btn.pass {
		background: rgba(255, 255, 255, 0.1);
		color: #f0e6d3;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.whist-btn.half_whist {
		background: #8b6914;
		color: #fff;
	}

	.raspass-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		background: rgba(139, 0, 0, 0.25);
		border: 1px solid rgba(255, 107, 107, 0.4);
		border-radius: 10px;
		padding: 8px 16px;
		color: #ffd2d2;
		font-size: 14px;
	}

	.table-layout {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		width: 100%;
	}

	.table-center-column {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}

	.open-hand {
		text-align: center;
		background: rgba(0, 0, 0, 0.35);
		border: 1px dashed rgba(200, 169, 110, 0.4);
		border-radius: 10px;
		padding: 6px 12px;
		min-width: 0;
	}

	.open-hand h4 {
		margin: 0;
		font-size: 12px;
		color: #c8a96e;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.open-hands-others {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		justify-content: center;
		width: 100%;
	}

	.open-hand-side {
		width: min(140px, 22vw);
	}

	.open-hand-side :global(.hand) {
		flex-direction: column;
		align-items: center;
		overflow: visible;
		padding: 6px 0;
	}

	.open-hand-side :global(.card) {
		margin-right: 0;
		margin-bottom: -46px;
	}

	.open-hand-side :global(.card:last-child) {
		margin-bottom: 0;
	}

	.round-summary {
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid #c8a96e;
		border-radius: 10px;
		padding: 14px 20px;
		color: #f0e6d3;
		text-align: center;
	}

	.round-summary h3 {
		margin: 0 0 8px;
		color: #ffd700;
		font-size: 15px;
	}

	.round-summary p {
		margin: 4px 0;
		font-size: 14px;
	}

	.summary-tricks {
		list-style: none;
		padding: 0;
		margin: 8px 0 12px;
		font-size: 13px;
		color: #c0b090;
	}

	.bidding-area {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.turn-indicator {
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 20px;
		padding: 6px 18px;
		font-size: 14px;
		color: #c0b090;
	}

	.turn-indicator.my-turn {
		background: rgba(255, 215, 0, 0.15);
		border-color: #ffd700;
		color: #ffd700;
		font-weight: bold;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.3);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(255, 215, 0, 0);
		}
	}

	.my-hand {
		width: 100%;
		text-align: center;
	}

	.play-hint {
		font-size: 12px;
		color: #888;
		margin: 4px 0 0;
	}

	/* ── Finish-early modal ── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 500;
		padding: 16px;
	}

	.modal-card {
		background: #1a1a2e;
		border: 1px solid rgba(200, 169, 110, 0.6);
		border-radius: 16px;
		padding: 24px 28px;
		max-width: 440px;
		width: 100%;
		color: #f0e6d3;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
		animation: slideUp 0.2s ease;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-title {
		margin: 0 0 10px;
		font-size: 18px;
		color: #ffd700;
		text-align: center;
	}

	.modal-body {
		font-size: 14px;
		color: #c0b090;
		text-align: center;
		margin: 0 0 16px;
	}

	.vote-list {
		list-style: none;
		padding: 0;
		margin: 0 0 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.vote-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 8px;
		padding: 6px 12px;
		font-size: 14px;
	}

	.vote-badge {
		font-size: 16px;
		font-weight: bold;
		color: #888;
	}

	.vote-item.vote-yes .vote-badge {
		color: #2ecc71;
	}

	.vote-item.vote-no .vote-badge {
		color: #e74c3c;
	}

	.mini-btn.black {
		color: #111;
		background: rgba(255, 255, 255, 0.92);
	}

	.mini-btn.nt {
		color: #ffd700;
	}

	.modal-actions {
		display: flex;
		gap: 10px;
		justify-content: center;
	}

	.modal-waiting {
		text-align: center;
		font-size: 13px;
		color: #c0b090;
		margin: 0;
	}

	/* Lobby redirect notice */
	.redirect-notice {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(46, 204, 113, 0.15);
		border: 1px solid rgba(46, 204, 113, 0.5);
		color: #b7f7d0;
		border-radius: 20px;
		padding: 10px 24px;
		font-size: 14px;
		z-index: 600;
		animation: fadeIn 0.3s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (max-width: 768px) {
		.game-area {
			flex-direction: column;
			align-items: center;
		}

		.sidebar {
			width: 100%;
			flex-direction: row;
			flex-wrap: wrap;
		}

		.waiting-shell,
		.leave-table-btn {
			width: 100%;
		}

		.table-layout {
			gap: 8px;
		}
	}

	@media (max-width: 480px) {
		.game-page {
			gap: 8px;
		}

		.status-bar {
			font-size: 11px;
			gap: 8px;
			padding: 6px 10px;
		}

		.governance-actions {
			gap: 4px;
		}

		.governance-btn {
			font-size: 11px;
			padding: 6px 10px;
		}

		.modal-card {
			padding: 16px 18px;
		}

		.table-layout {
			gap: 6px;
		}

		.open-hand-side {
			width: 78px;
			padding: 4px 6px;
		}

		.open-hand-side h4 {
			font-size: 10px;
			letter-spacing: 0.4px;
		}

		.open-hand-side :global(.card) {
			margin-bottom: -38px;
		}
	}
</style>
