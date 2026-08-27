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
	import { validCardsForPlay } from '$lib/utils/cards';
	import type { PageData } from './$types';
	import type {
		Card,
		Bid,
		Contract,
		ContractLevel,
		ContractSuit,
		Suit,
		WhistChoice,
		AgreementTerm
	} from '$lib/types/preferans';

	let { data }: { data: PageData } = $props();

	let selectedCard: Card | null = $state(null);
	let selectedOpenHandCard: Card | null = $state(null);
	/** Track whether a finishProposal was active so we can redirect on approval. */
	let hadFinishProposal = $state(false);
	/** Show the lobby-redirect countdown message after approved finish. */
	let redirectingToLobby = $state(false);

	/** Delay (ms) before redirecting to lobby after an approved early-finish vote. */
	const REDIRECT_DELAY_MS = 3000;
	const TITLE_BLINK_INTERVAL_MS = 1000;

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

	onMount(() => {
		game.connect(data.gameId, data.sessionToken);
	});

	onDestroy(() => {
		game.disconnect();
	});

	let isMyTurn = $derived($game.state?.currentPlayerId === data.user?.id);
	let myPlayerId = $derived(data.user?.id ?? '');
	let currentContract = $derived($game.state?.contract ?? $game.state?.wonBid ?? null);
	let finishProposal = $derived($game.state?.finishProposal ?? null);
	let pauseProposal = $derived($game.state?.pauseProposal ?? null);
	let agreementProposal = $derived($game.state?.agreementProposal ?? null);
	// Backend enforces mutual exclusion (only one proposal can be active at a time).
	let activeProposal = $derived(finishProposal ?? pauseProposal ?? agreementProposal);
	let isProposalProposer = $derived(activeProposal?.proposedBy === myPlayerId);
	let hasPendingVote = $derived(activeProposal ? activeProposal.votes[myPlayerId] === null : false);

	let lightDecisionPending = $derived($game.state?.lightDecisionBy ?? null);
	let pendingTrick = $derived($game.state?.pendingTrick ?? null);
	let widowTakenByDeclarer = $derived($game.state?.widowTakenByDeclarer ?? false);
	let isDeclarer = $derived($game.state?.declarerId === myPlayerId);

	// ── Open-hand control (whister controls declarer's open hand) ──
	let isDeclarerHandOpen = $derived(
		$game.state?.declarerId != null && $game.state.declarerId in ($game.state?.openHands ?? {})
	);
	let isWhister = $derived(($game.state?.whisters ?? []).includes(myPlayerId));
	/** Whether this player can propose an end-by-agreement (declarer or whister, during play, non-raspass) */
	let canProposeAgreement = $derived(
		$gamePhase === 'playing' &&
			!$game.state?.raspass &&
			$game.state?.contract != null &&
			(isDeclarer || isWhister)
	);
	/** UI state for the agreement-proposal form */
	let showAgreementForm = $state(false);
	let agreementTermSelected = $state<AgreementTerm>('fulfill');
	let agreementTricksInput = $state(6);
	/** Scoreboard modal */
	let showScoreModal = $state(false);
	/** Game End dropdown menu */
	let showGameEndMenu = $state(false);
	/** Open-hand control (whister controls declarer's open hand) */
	let canControlDeclarerHand = $derived(
		$gamePhase === 'playing' &&
			!lightDecisionPending &&
			!pendingTrick &&
			isDeclarerHandOpen &&
			isWhister &&
			$game.state?.currentPlayerId === $game.state?.declarerId
	);
	/** True when the whister should confirm a trick won by the open-handed declarer. */
	let isDeclarerTrickToConfirm = $derived(
		pendingTrick != null &&
			pendingTrick.winnerId === $game.state?.declarerId &&
			isDeclarerHandOpen &&
			isWhister
	);

	// Declarer cannot play their own hand once they've declared it open.
	let canPlayCard = $derived(
		$gamePhase === 'playing' &&
			isMyTurn &&
			!lightDecisionPending &&
			!pendingTrick &&
			!(isDeclarer && isDeclarerHandOpen)
	);
	// Declarer cannot confirm tricks from their open hand (whister does it).
	let isMyTrickToConfirm = $derived(
		pendingTrick?.winnerId === myPlayerId && !(isDeclarer && isDeclarerHandOpen)
	);

	// ── Last trick modal ──
	let showLastTrickModal = $state(false);
	let lastCompletedTrick = $derived(
		$game.state?.completedTricks?.[$game.state.completedTricks.length - 1] ?? null
	);

	// ── Next-round leader: who will lead the next trick ──
	// Used to visually mark the expected first player each trick/round.
	let nextRoundLeaderId = $derived(() => {
		if ($gamePhase !== 'playing') return null as string | null;
		// Trick in progress: show who led the current trick
		if ($currentTrick?.cards && $currentTrick.cards.length > 0) {
			return $currentTrick.cards[0].playerId;
		}
		// Trick complete but awaiting confirmation: show the winner
		if (pendingTrick?.winnerId) return pendingTrick.winnerId;
		// Between tricks: show winner of last completed trick (they lead next)
		if (lastCompletedTrick?.winnerId) return lastCompletedTrick.winnerId;
		// First trick of round, no cards yet – show who plays first
		return $game.state?.currentPlayerId ?? null;
	});

	// ── Sorted hand derived state ──
	let sortedHand = $derived(sortHand($myHand));

	// ── Legal cards for the current trick ──
	// Mirrors validCards() in the game engine so we can disable illegal cards
	// and auto-play when only one option is available.
	let eligibleCards = $derived(
		canPlayCard
			? validCardsForPlay(
					sortedHand,
					$currentTrick,
					$game.state?.trump ?? null,
					$game.state?.raspassUpcard?.suit ?? null
				)
			: null
	);

	// ── Open hands organised by relative position ──
	// Key = playerId, value = sorted cards.
	// Order is frozen the first time a hand appears (no reshuffling after first reveal).
	let frozenOpenHandCards = $state<Record<string, Card[]>>({});

	$effect(() => {
		const openHands = $game.state?.openHands ?? {};

		// Clear frozen hands when open hands become empty (between rounds / after game)
		if (Object.keys(openHands).length === 0) {
			if (Object.keys(frozenOpenHandCards).length > 0) {
				frozenOpenHandCards = {};
			}
			return;
		}

		// Freeze new hands as they appear for the first time
		let changed = false;
		const next: Record<string, Card[]> = { ...frozenOpenHandCards };
		for (const [pid, cards] of Object.entries(openHands)) {
			if (!(pid in next)) {
				next[pid] = sortHand(cards);
				changed = true;
			}
		}
		if (changed) frozenOpenHandCards = next;
	});

	let sortedOpenHands = $derived(
		Object.fromEntries(
			Object.entries($game.state?.openHands ?? {}).map(([pid, cards]) => [
				pid,
				frozenOpenHandCards[pid] ?? sortHand(cards)
			])
		)
	);

	// ── Eligible cards in the declarer's open hand (for the controlling whister) ──
	let declarerOpenHandCards = $derived(
		isDeclarerHandOpen && $game.state?.declarerId
			? (sortedOpenHands[$game.state.declarerId] ?? [])
			: []
	);
	let declarerOpenHandEligibleCards = $derived(
		canControlDeclarerHand
			? validCardsForPlay(
					declarerOpenHandCards,
					$currentTrick,
					$game.state?.trump ?? null,
					$game.state?.raspassUpcard?.suit ?? null
				)
			: null
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
		$gamePhase === 'widow' && isDeclarer && widowTakenByDeclarer
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
		// Close the agreement form if any proposal becomes active
		if (activeProposal) showAgreementForm = false;
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

	// Auto-play when there is exactly one legal card to play.
	// A non-reactive guard prevents re-sending the same card if the server
	// briefly echoes back an unchanged state.
	let lastAutoPlayKey: string | null = null;
	$effect(() => {
		if (!canPlayCard || !eligibleCards || eligibleCards.length !== 1) {
			lastAutoPlayKey = null;
			return;
		}
		const card = eligibleCards[0];
		const key = `${card.suit}:${card.rank}`;
		if (key === lastAutoPlayKey) return;
		lastAutoPlayKey = key;
		selectedCard = null;
		game.send({ type: 'play_card', card });
	});

	// Auto-play the declarer's open hand when there is exactly one legal card.
	let lastOpenHandAutoPlayKey: string | null = null;
	$effect(() => {
		if (
			!canControlDeclarerHand ||
			!declarerOpenHandEligibleCards ||
			declarerOpenHandEligibleCards.length !== 1
		) {
			lastOpenHandAutoPlayKey = null;
			return;
		}
		const card = declarerOpenHandEligibleCards[0];
		const key = `${card.suit}:${card.rank}`;
		if (key === lastOpenHandAutoPlayKey) return;
		lastOpenHandAutoPlayKey = key;
		selectedOpenHandCard = null;
		game.send({ type: 'play_card', card });
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

	function handlePlayOpenHandCard(card: Card) {
		if (!canControlDeclarerHand) return;
		if (selectedOpenHandCard && sameCard(selectedOpenHandCard, card)) {
			game.send({ type: 'play_card', card });
			selectedOpenHandCard = null;
		} else {
			selectedOpenHandCard = card;
		}
	}

	function declareOpenHand() {
		game.send({ type: 'declare_open_hand' });
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
			return;
		}
		if (agreementProposal) {
			game.send({ type: 'vote_end_by_agreement', approve });
		}
	}

	function proposeEndByAgreement() {
		const term: AgreementTerm =
			agreementTermSelected === 'fulfill' || agreementTermSelected === 'rest_are_mine'
				? agreementTermSelected
				: agreementTricksInput;
		game.send({ type: 'request_end_by_agreement', term });
		showAgreementForm = false;
	}

	function formatAgreementTerm(term: AgreementTerm): string {
		if (term === 'fulfill') return $t('app.game.agreementTermFulfill');
		if (term === 'rest_are_mine') return $t('app.game.agreementTermRestAreMine');
		return $t('app.game.agreementTermTricks', { count: term });
	}

	function takeWidow() {
		game.send({ type: 'take_widow' });
	}

	function confirmTrick() {
		game.send({ type: 'confirm_trick' });
	}

	function attentionTitle(): string | null {
		if (!data.isPlayer) return null;

		if ($gamePhase === 'waiting' && ($game.state?.players.length ?? 0) < 3) {
			return $t('app.game.waitingPlayers', { count: $game.state?.players.length ?? 0 });
		}

		if (hasPendingVote && !isProposalProposer) {
			if (finishProposal) return $t('app.game.finishEarlyModalTitle');
			if (pauseProposal) return $t('app.game.pauseModalTitle');
			if (agreementProposal) return $t('app.game.agreementModalTitle');
		}

		if ($gamePhase === 'widow' && isDeclarer) {
			return widowTakenByDeclarer ? $t('app.game.widowTitle') : $t('app.game.takeWidow');
		}

		if (lightDecisionPending === myPlayerId) {
			return $t('app.game.lightChoiceTitle');
		}

		if ($gamePhase === 'bidding' && isMyTurn) {
			return $t('app.bidding.title');
		}

		if (pendingTrick && (isMyTrickToConfirm || isDeclarerTrickToConfirm)) {
			return $t('app.game.confirmTrick');
		}

		if ($gamePhase === 'scoring' && $game.state?.roundSummary) {
			return $t('app.game.nextRound');
		}

		if (canControlDeclarerHand || (isMyTurn && $gamePhase === 'playing')) {
			return $t('app.game.yourTurn');
		}

		return null;
	}

	$effect(() => {
		if (typeof document === 'undefined') return;

		const baseTitle = $t('app.game.title');
		const promptTitle = attentionTitle();
		document.title = baseTitle;

		if (!promptTitle) {
			return;
		}

		let showPrompt = false;
		document.title = `${promptTitle} — Preferans`;
		const interval = window.setInterval(() => {
			showPrompt = !showPrompt;
			document.title = showPrompt ? `${promptTitle} — Preferans` : baseTitle;
		}, TITLE_BLINK_INTERVAL_MS);

		return () => {
			window.clearInterval(interval);
			document.title = baseTitle;
		};
	});
</script>

<svelte:head>
	<title>{$t('app.game.title')}</title>
</svelte:head>

<div class="game-page">
	<!-- Toolbar: combined status + action buttons -->
	<div class="toolbar">
		<div class="toolbar-left">
			<span class="connection-status">{$t(`app.game.status.${$game.status}`)}</span>
			{#if $game.state}
				<span class="phase-label">{$t(`app.phase.${$gamePhase}`)}</span>
				{#if $game.state.trump}
					<span class="trump-label suit-symbol {`suit-${$game.state.trump}`}">
						{$game.state.trump === 'spades'
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
		<div class="toolbar-right">
			{#if $game.state}
				<button
					type="button"
					class="toolbar-btn"
					onclick={() => (showScoreModal = true)}
					aria-label={$t('app.game.scoreButton')}
				>
					📊 {$t('app.game.scoreButton')}
				</button>
				{#if $gamePhase !== 'waiting' && $gamePhase !== 'finished'}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="toolbar-menu-wrapper"
						onfocusout={(e) => {
							if (!e.currentTarget.contains(e.relatedTarget as Node)) showGameEndMenu = false;
						}}
					>
						<button
							type="button"
							class="toolbar-btn toolbar-btn-end"
							onclick={() => (showGameEndMenu = !showGameEndMenu)}
							aria-expanded={showGameEndMenu}
							aria-haspopup="menu"
						>
							{$t('app.game.gameEndButton')} ▾
						</button>
						{#if showGameEndMenu}
							<div class="toolbar-menu" role="menu">
								<button
									type="button"
									class="toolbar-menu-item"
									onclick={() => {
										proposeFinishEarly();
										showGameEndMenu = false;
									}}
									disabled={Boolean(activeProposal)}
									role="menuitem"
								>
									{$t('app.game.suggestFinishEarly')}
								</button>
								{#if canProposeAgreement}
									<button
										type="button"
										class="toolbar-menu-item"
										onclick={() => {
											showAgreementForm = !showAgreementForm;
											showGameEndMenu = false;
										}}
										disabled={Boolean(activeProposal)}
										role="menuitem"
									>
										{$t('app.game.suggestEndByAgreement')}
									</button>
								{/if}
								{#if $gamePhase !== 'paused'}
									<button
										type="button"
										class="toolbar-menu-item"
										onclick={() => {
											proposePause(60);
											showGameEndMenu = false;
										}}
										disabled={Boolean(activeProposal)}
										role="menuitem"
									>
										{$t('app.game.suggestPauseHour')}
									</button>
									<button
										type="button"
										class="toolbar-menu-item"
										onclick={() => {
											proposePause(null);
											showGameEndMenu = false;
										}}
										disabled={Boolean(activeProposal)}
										role="menuitem"
									>
										{$t('app.game.suggestPauseIndefinite')}
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</div>

	{#if showAgreementForm && canProposeAgreement && !activeProposal}
		<div class="agreement-form">
			<p class="agreement-form-label">{$t('app.game.agreementLabel')}</p>
			<label class="agreement-radio">
				<input
					type="radio"
					name="agreement-term"
					value="fulfill"
					bind:group={agreementTermSelected}
				/>
				{$t('app.game.agreementTermFulfill')}
			</label>
			<label class="agreement-radio">
				<input
					type="radio"
					name="agreement-term"
					value="rest_are_mine"
					bind:group={agreementTermSelected}
				/>
				{$t('app.game.agreementTermRestAreMine')}
			</label>
			<label class="agreement-radio">
				<input
					type="radio"
					name="agreement-term"
					value={agreementTricksInput}
					bind:group={agreementTermSelected}
				/>
				<input
					type="number"
					min="0"
					max="10"
					class="tricks-input"
					bind:value={agreementTricksInput}
					onclick={() => (agreementTermSelected = agreementTricksInput)}
					oninput={() => (agreementTermSelected = agreementTricksInput)}
				/>
				{$t('app.game.agreementTermTricks', { count: agreementTricksInput })}
			</label>
			<div class="agreement-form-actions">
				<button type="button" class="vote-btn yes" onclick={proposeEndByAgreement}>
					{$t('app.game.voteYes')}
				</button>
				<button type="button" class="vote-btn no" onclick={() => (showAgreementForm = false)}>
					{$t('app.game.voteNo')}
				</button>
			</div>
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
							<PlayerBadge
								playerId={player.id}
								name={player.name}
								offline={player.isOnline === false}
							/>
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

	<!-- End-by-agreement proposal modal -->
	{#if agreementProposal}
		{@const agreementProposerName =
			$game.state?.players.find((p) => p.id === agreementProposal.proposedBy)?.name ?? ''}
		<div
			class="modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-labelledby="agreement-modal-title"
		>
			<div class="modal-card">
				<h2 id="agreement-modal-title" class="modal-title">
					{$t('app.game.agreementModalTitle')}
				</h2>
				<p class="modal-body">
					{$t('app.game.agreementModalBody', { name: agreementProposerName })}
				</p>
				<p class="agreement-term-display">
					<strong>{$t('app.game.agreementLabel')}</strong>
					{formatAgreementTerm(agreementProposal.term)}
				</p>
				<!-- Show each voter's vote status -->
				<ul class="vote-list">
					{#each $game.state?.players.filter((p) => p.id in agreementProposal.votes) ?? [] as player}
						{@const vote = agreementProposal.votes[player.id]}
						<li class="vote-item" class:vote-yes={vote === 'yes'} class:vote-no={vote === 'no'}>
							<PlayerBadge
								playerId={player.id}
								name={player.name}
								offline={player.isOnline === false}
							/>
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
					<p class="modal-waiting">{$t('app.game.proposalBy', { name: agreementProposerName })}</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Main game area (full width) -->
	<div class="content-area">
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
							playable={canControlDeclarerHand && openHandLeftPlayer.id === $game.state?.declarerId}
							selectedCard={canControlDeclarerHand &&
							openHandLeftPlayer.id === $game.state?.declarerId
								? selectedOpenHandCard
								: null}
							eligibleCards={canControlDeclarerHand &&
							openHandLeftPlayer.id === $game.state?.declarerId
								? declarerOpenHandEligibleCards
								: null}
							onPlayCard={handlePlayOpenHandCard}
							label={openHandLeftPlayer.name}
							groupBySuit={true}
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
						{currentContract}
						declarerId={$game.state.declarerId}
						bulletTarget={$game.state.bulletTarget}
						bids={$game.state.bids}
						whistDeclarations={$game.state.whistDeclarations}
						phase={$gamePhase}
						completedTricks={$game.state.completedTricks}
						nextRoundLeaderId={nextRoundLeaderId()}
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
							playable={canControlDeclarerHand &&
								openHandRightPlayer.id === $game.state?.declarerId}
							selectedCard={canControlDeclarerHand &&
							openHandRightPlayer.id === $game.state?.declarerId
								? selectedOpenHandCard
								: null}
							eligibleCards={canControlDeclarerHand &&
							openHandRightPlayer.id === $game.state?.declarerId
								? declarerOpenHandEligibleCards
								: null}
							onPlayCard={handlePlayOpenHandCard}
							label={openHandRightPlayer.name}
							groupBySuit={true}
						/>
					</div>
				{/if}
			</div>

			{#if openHandOthers.length > 0}
				<div class="open-hands-others">
					{#each openHandOthers as [openPlayerId, cards] (openPlayerId)}
						<div class="open-hand">
							<h4>{$t('app.game.openHandOf', { name: playerName(openPlayerId) })}</h4>
							<Hand
								{cards}
								playable={canControlDeclarerHand && openPlayerId === $game.state?.declarerId}
								selectedCard={canControlDeclarerHand && openPlayerId === $game.state?.declarerId
									? selectedOpenHandCard
									: null}
								eligibleCards={canControlDeclarerHand && openPlayerId === $game.state?.declarerId
									? declarerOpenHandEligibleCards
									: null}
								onPlayCard={handlePlayOpenHandCard}
								label={playerName(openPlayerId)}
							/>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Widow reveal: visible to all players while declarer hasn't taken it yet -->
			{#if $gamePhase === 'widow' && !widowTakenByDeclarer && $game.state.widow.length > 0}
				<div class="widow-area widow-reveal">
					<h3>{$t('app.game.widowRevealTitle')}</h3>
					<p class="widow-hint">
						{$t('app.game.widowRevealHint', { name: playerName($game.state.declarerId) })}
					</p>
					<Hand cards={$game.state.widow} playable={false} label={$t('app.game.widow')} />
					{#if isDeclarer}
						<button class="confirm-btn" onclick={takeWidow}>
							{$t('app.game.takeWidow')}
						</button>
					{/if}
				</div>
			{/if}

			<!-- Widow: declarer discards two cards and announces the contract -->
			{#if $gamePhase === 'widow' && isDeclarer && widowTakenByDeclarer}
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
					<BiddingPanel currentHighBid={highBid} myTurn={isMyTurn} {canMisere} onBid={handleBid} />
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
				{#if pendingTrick}
					{#if isMyTrickToConfirm || isDeclarerTrickToConfirm}
						<button class="confirm-btn confirm-trick-btn" onclick={confirmTrick}>
							{$t('app.game.confirmTrick')}
						</button>
					{:else}
						<div class="turn-indicator" role="status">
							{$t('app.game.awaitingTrickConfirm', { name: playerName(pendingTrick.winnerId) })}
						</div>
					{/if}
				{:else if canControlDeclarerHand}
					<div class="turn-indicator my-turn" role="status">{$t('app.game.yourTurn')}</div>
				{:else if $game.state.currentPlayerId && $game.state.currentPlayerId !== data.user?.id}
					<div class="turn-indicator" role="status">
						{$t('app.game.turn', { name: playerName($game.state.currentPlayerId) })}
					</div>
				{:else if isMyTurn && $gamePhase === 'playing'}
					<div class="turn-indicator my-turn" role="status">{$t('app.game.yourTurn')}</div>
				{/if}
			{/if}

			<!-- Show last trick button -->
			{#if $gamePhase === 'playing' && lastCompletedTrick}
				<button class="last-trick-btn" onclick={() => (showLastTrickModal = true)}>
					{$t('app.game.showLastTrick')}
				</button>
			{/if}
		{/if}

		<!-- Player hand -->
		{#if $gamePhase === 'widow' && isDeclarer && widowTakenByDeclarer}
			<div class="my-hand">
				<Hand
					cards={combinedWidowHand}
					playable={true}
					selectedCard={null}
					selectedCards={discardSelection}
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
					{eligibleCards}
					onPlayCard={handlePlayCard}
					label={$t('app.game.yourCards')}
				/>
				{#if isDeclarer && $gamePhase === 'playing' && !isDeclarerHandOpen && $game.state?.whisters && $game.state.whisters.length > 0}
					<button class="declare-open-btn" onclick={declareOpenHand}>
						{$t('app.game.declareOpenHand')}
					</button>
				{/if}
				{#if canPlayCard && selectedCard}
					<p class="play-hint">{$t('app.game.playHint')}</p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Last trick modal -->
	{#if showLastTrickModal && lastCompletedTrick}
		<div
			class="modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-labelledby="last-trick-modal-title"
		>
			<div class="modal-card">
				<h2 id="last-trick-modal-title" class="modal-title">
					{$t('app.game.lastTrickTitle')}
				</h2>
				<div class="last-trick-cards">
					{#each lastCompletedTrick.cards as entry}
						{@const playerN = playerName(entry.playerId)}
						<div
							class="last-trick-card-slot"
							class:winner={entry.playerId === lastCompletedTrick.winnerId}
						>
							<span class="last-trick-player">{playerN}</span>
							<Hand cards={[entry.card]} playable={false} label={playerN} />
							{#if entry.playerId === lastCompletedTrick.winnerId}
								<span class="last-trick-winner-badge">★</span>
							{/if}
						</div>
					{/each}
				</div>
				<div class="modal-actions">
					<button type="button" class="vote-btn yes" onclick={() => (showLastTrickModal = false)}>
						{$t('app.game.closeModal')}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Scoreboard modal -->
	{#if showScoreModal && $game.state}
		<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="score-modal-title">
			<div class="modal-card modal-card-wide">
				<h2 id="score-modal-title" class="modal-title">
					{$t('app.game.scoreButton')}
				</h2>
				<Scoreboard
					pool={$game.state.pool}
					mountain={$game.state.mountain}
					whists={$game.state.whists}
					scores={$game.state.scores}
					players={$game.state.players}
					roundNumber={$game.state.roundNumber}
					bulletTarget={$game.state.bulletTarget}
				/>
				<div class="modal-actions" style="margin-top: 16px;">
					<button type="button" class="vote-btn yes" onclick={() => (showScoreModal = false)}>
						{$t('app.game.closeModal')}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Lobby redirect notice after early finish -->
	{#if redirectingToLobby}
		<div class="redirect-notice" role="status">
			{$t('app.game.redirectingToLobby')}
		</div>
	{/if}
</div>

<style>
	.game-page {
		--layout-chrome-height: 120px;
		--open-hand-side-width: 200px;
		--open-hand-side-width-viewport: 28vw;
		--open-hand-overlap: 46px;
		--open-hand-overlap-mobile: 38px;

		width: 100%;
		padding: 0 8px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: min(100%, calc(100dvh - var(--layout-chrome-height)));
	}

	/* ── Combined toolbar ── */
	.toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		background: rgba(0, 0, 0, 0.5);
		border-radius: 8px;
		font-size: 13px;
		flex-wrap: wrap;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		flex-wrap: wrap;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.toolbar-btn {
		border: 1px solid rgba(200, 169, 110, 0.45);
		background: rgba(200, 169, 110, 0.14);
		color: #f0e6d3;
		border-radius: 999px;
		padding: 5px 12px;
		font-size: 12px;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.15s;
	}

	.toolbar-btn:hover {
		background: rgba(200, 169, 110, 0.25);
	}

	.toolbar-btn-end {
		border-color: rgba(255, 107, 107, 0.45);
		background: rgba(255, 107, 107, 0.1);
		color: #ffd2d2;
	}

	.toolbar-btn-end:hover {
		background: rgba(255, 107, 107, 0.2);
	}

	/* Dropdown menu */
	.toolbar-menu-wrapper {
		position: relative;
	}

	.toolbar-menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		min-width: 200px;
		background: #1a1a2e;
		border: 1px solid rgba(200, 169, 110, 0.5);
		border-radius: 10px;
		padding: 6px 0;
		z-index: 200;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
	}

	.toolbar-menu-item {
		display: block;
		width: 100%;
		padding: 9px 16px;
		text-align: left;
		background: transparent;
		border: none;
		color: #f0e6d3;
		font-size: 13px;
		cursor: pointer;
		transition: background 0.12s;
	}

	.toolbar-menu-item:hover:not(:disabled) {
		background: rgba(200, 169, 110, 0.15);
	}

	.toolbar-menu-item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.agreement-form {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(200, 169, 110, 0.3);
		border-radius: 12px;
		padding: 12px 16px;
		color: #f0e6d3;
		display: grid;
		gap: 8px;
	}

	.agreement-form-label {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: #c8a96e;
	}

	.agreement-radio {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		cursor: pointer;
	}

	.tricks-input {
		width: 52px;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(200, 169, 110, 0.4);
		border-radius: 6px;
		color: #f0e6d3;
		padding: 2px 6px;
		font-size: 13px;
	}

	.agreement-form-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}

	.agreement-term-display {
		margin: 4px 0 8px;
		font-size: 14px;
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

	.content-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		width: 100%;
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 40px;
		height: 40px;
		padding: 0 10px;
		border: 1px solid rgba(200, 169, 110, 0.7);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.94);
		color: #1a1a2e;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			box-shadow 0.15s,
			transform 0.15s,
			color 0.15s;
	}

	.mini-btn.active {
		background: #fff7d6;
		border-color: #ffd700;
		box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.28);
		transform: translateY(-1px);
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

	.declare-open-btn {
		margin-top: 8px;
		padding: 6px 14px;
		border-radius: 6px;
		border: 1px solid #c8a96e;
		background: transparent;
		color: #c8a96e;
		font-size: 13px;
		cursor: pointer;
	}

	.declare-open-btn:hover {
		background: rgba(200, 169, 110, 0.15);
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
		width: min(var(--open-hand-side-width), var(--open-hand-side-width-viewport));
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

	.modal-card-wide {
		max-width: 600px;
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
	}

	.mini-btn.nt {
		color: #6c5200;
		letter-spacing: 0.04em;
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
			padding: 0 4px;
		}

		.toolbar {
			font-size: 11px;
			gap: 6px;
			padding: 5px 8px;
		}

		.toolbar-btn {
			font-size: 11px;
			padding: 4px 9px;
		}

		.modal-card {
			padding: 16px 18px;
		}

		.table-layout {
			gap: 6px;
		}

		.open-hand-side {
			width: min(120px, 26vw);
			padding: 4px 6px;
		}

		.open-hand-side h4 {
			font-size: 10px;
			letter-spacing: 0.4px;
		}
	}

	.widow-reveal {
		border-color: rgba(200, 169, 110, 0.6);
		background: rgba(0, 0, 0, 0.65);
	}

	.confirm-trick-btn {
		padding: 10px 28px;
		border-radius: 8px;
		border: 2px solid #ffd700;
		background: rgba(255, 215, 0, 0.18);
		color: #ffd700;
		font-weight: bold;
		font-size: 15px;
		cursor: pointer;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.last-trick-btn {
		border: 1px solid rgba(200, 169, 110, 0.4);
		background: rgba(200, 169, 110, 0.1);
		color: #c8a96e;
		border-radius: 999px;
		padding: 6px 14px;
		font-size: 13px;
		cursor: pointer;
	}

	.last-trick-cards {
		display: flex;
		gap: 16px;
		justify-content: center;
		flex-wrap: wrap;
		margin: 16px 0;
	}

	.last-trick-card-slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px;
		border-radius: 8px;
		border: 1px solid rgba(200, 169, 110, 0.2);
		background: rgba(0, 0, 0, 0.3);
	}

	.last-trick-card-slot.winner {
		border-color: rgba(255, 215, 0, 0.6);
		background: rgba(255, 215, 0, 0.08);
	}

	.last-trick-player {
		font-size: 12px;
		color: #c0b090;
	}

	.last-trick-winner-badge {
		font-size: 16px;
		color: #ffd700;
	}
</style>
