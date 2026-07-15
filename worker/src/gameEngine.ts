/**
 * Preferans (Преферанс) game engine
 * Implements the classic Russian 3-player trick-taking card game.
 */

export type Suit = 'spades' | 'clubs' | 'diamonds' | 'hearts';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type ContractSuit = Suit | 'no_trump';
export type ContractLevel = 6 | 7 | 8 | 9 | 10;

export interface Card {
	suit: Suit;
	rank: Rank;
}

export interface SuitContract {
	type: 'suit';
	level: ContractLevel;
	suit: ContractSuit;
}

export interface MisereContract {
	type: 'misere';
	open: boolean;
}

export interface GrandContract {
	type: 'grand';
	level: ContractLevel;
	open: boolean;
}

export type Contract = SuitContract | MisereContract | GrandContract;
export type Bid = Contract | 'pass';

export type PlayerId = string;

export type GamePhase =
	| 'waiting'
	| 'dealing'
	| 'bidding'
	| 'widow'
	| 'discard'
	| 'playing'
	| 'scoring'
	| 'paused'
	| 'finished';

export type ProposalVote = 'yes' | 'no' | null;

export interface FinishProposal {
	proposedBy: PlayerId;
	votes: Record<PlayerId, ProposalVote>;
}

export interface PauseProposal extends FinishProposal {
	durationMinutes: number | null;
}

export interface Trick {
	cards: { playerId: PlayerId; card: Card }[];
	winnerId: PlayerId | null;
	leadSuit: Suit | null;
}

export interface GameState {
	id: string;
	phase: GamePhase;
	playerIds: PlayerId[];
	currentPlayerId: PlayerId | null;
	hands: Record<PlayerId, Card[]>;
	widow: Card[];
	currentTrick: Trick | null;
	completedTricks: Trick[];
	bids: { playerId: PlayerId; bid: Bid }[];
	contract: Contract | null;
	declarerId: PlayerId | null;
	trump: Suit | null;
	scores: Record<PlayerId, number>;
	roundNumber: number;
	finishProposal: FinishProposal | null;
	pauseProposal: PauseProposal | null;
	pausedUntil: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_ORDER: Record<Rank, number> = {
	'7': 0,
	'8': 1,
	'9': 2,
	'10': 3,
	J: 4,
	Q: 5,
	K: 6,
	A: 7
};

/** Contract point values for scoring (suit contract at level 6) */
const CONTRACT_BASE_VALUE: Record<ContractSuit, number> = {
	spades: 2,
	clubs: 3,
	diamonds: 4,
	hearts: 5,
	no_trump: 6
};

// ─── Deck utilities ───────────────────────────────────────────────────────────

export function createDeck(): Card[] {
	const deck: Card[] = [];
	for (const suit of SUITS) {
		for (const rank of RANKS) {
			deck.push({ suit, rank });
		}
	}
	return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
	const d = [...deck];
	for (let i = d.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[d[i], d[j]] = [d[j], d[i]];
	}
	return d;
}

export function deal(
	deck: Card[],
	playerIds: PlayerId[]
): {
	hands: Record<PlayerId, Card[]>;
	widow: Card[];
} {
	if (playerIds.length !== 3) throw new Error('Preferans requires exactly 3 players');
	const shuffled = shuffleDeck(deck);
	const hands: Record<PlayerId, Card[]> = {};
	// 10 cards each, 2 in widow
	for (let i = 0; i < 3; i++) {
		hands[playerIds[i]] = shuffled.slice(i * 10, (i + 1) * 10);
	}
	const widow = shuffled.slice(30, 32);
	return { hands, widow };
}

// ─── Card comparison ──────────────────────────────────────────────────────────

export function cardBeats(
	challenger: Card,
	leader: Card,
	trump: Suit | null,
	leadSuit: Suit
): boolean {
	const challengerIsTrump = trump !== null && challenger.suit === trump;
	const leaderIsTrump = trump !== null && leader.suit === trump;

	if (challengerIsTrump && !leaderIsTrump) return true;
	if (!challengerIsTrump && leaderIsTrump) return false;
	if (challenger.suit !== leader.suit && challenger.suit !== leadSuit) return false;
	if (challenger.suit === leadSuit && leader.suit !== leadSuit && !leaderIsTrump) return true;
	if (challenger.suit !== leader.suit) return false;

	return RANK_ORDER[challenger.rank] > RANK_ORDER[leader.rank];
}

export function trickWinner(trick: Trick, trump: Suit | null): PlayerId {
	const leadSuit = trick.leadSuit ?? trick.cards[0].card.suit;
	let winningEntry = trick.cards[0];
	for (let i = 1; i < trick.cards.length; i++) {
		const challenger = trick.cards[i];
		if (cardBeats(challenger.card, winningEntry.card, trump, leadSuit)) {
			winningEntry = challenger;
		}
	}
	return winningEntry.playerId;
}

// ─── Bidding ──────────────────────────────────────────────────────────────────

export function contractValue(c: Contract): number {
	if (c.type === 'misere') return c.open ? 110 : 100;
	if (c.type === 'grand') return c.open ? 130 + c.level * 10 : 120 + c.level * 10;
	const suitRank = c.suit === 'no_trump' ? 4 : SUITS.indexOf(c.suit as Suit);
	return (c.level - 6) * 50 + suitRank;
}

export function isValidBid(bid: Bid, currentHigh: Contract | null): boolean {
	if (bid === 'pass') return true;
	if (!currentHigh) return true;
	return contractValue(bid) > contractValue(currentHigh);
}

/** Returns the winning contract after the bidding round, or null if all passed */
export function resolveBidding(bids: { playerId: PlayerId; bid: Bid }[]): {
	contract: Contract | null;
	declarerId: PlayerId | null;
} {
	let best: { contract: Contract; playerId: PlayerId } | null = null;
	for (const { playerId, bid } of bids) {
		if (bid === 'pass') continue;
		if (!best || contractValue(bid) > contractValue(best.contract)) {
			best = { contract: bid, playerId };
		}
	}
	return best
		? { contract: best.contract, declarerId: best.playerId }
		: { contract: null, declarerId: null };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function scoreRound(
	contract: Contract,
	declarerId: PlayerId,
	playerIds: PlayerId[],
	tricks: Trick[]
): Record<PlayerId, number> {
	const scores: Record<PlayerId, number> = {};
	for (const pid of playerIds) scores[pid] = 0;

	const declarerTricks = tricks.filter((t) => t.winnerId === declarerId).length;
	const defenderIds = playerIds.filter((p) => p !== declarerId);

	if (contract.type === 'misere') {
		// Misere: declarer must take 0 tricks
		if (declarerTricks === 0) {
			scores[declarerId] = contract.open ? 20 : 10;
		} else {
			scores[declarerId] = contract.open ? -20 : -10;
		}
		return scores;
	}

	const contractLevel = contract.type === 'suit' || contract.type === 'grand' ? contract.level : 6;
	const pointValue =
		contract.type === 'suit'
			? CONTRACT_BASE_VALUE[contract.suit] * contractLevel
			: contract.type === 'grand'
				? 10 * contractLevel
				: 0;

	if (declarerTricks >= contractLevel) {
		// Fulfilled: gain points per extra trick too
		const overtricks = declarerTricks - contractLevel;
		const overtrickValue = contract.type === 'suit' ? CONTRACT_BASE_VALUE[contract.suit] : 10;
		scores[declarerId] = pointValue + overtricks * overtrickValue;
	} else {
		// Underfulfilled: lose double points
		scores[declarerId] = -pointValue * 2;
		// Defenders each score whist points for tricks taken
		const trickValue = contract.type === 'suit' ? CONTRACT_BASE_VALUE[contract.suit] : 10;
		for (const def of defenderIds) {
			const defTricks = tricks.filter((t) => t.winnerId === def).length;
			scores[def] = defTricks * trickValue;
		}
	}

	return scores;
}

// ─── Move validation ──────────────────────────────────────────────────────────

export function validCards(hand: Card[], trick: Trick | null, trump: Suit | null): Card[] {
	if (!trick || trick.cards.length === 0) {
		// Leading — any card is valid
		return hand;
	}
	const leadSuit = trick.leadSuit ?? trick.cards[0].card.suit;
	const samesuit = hand.filter((c) => c.suit === leadSuit);
	if (samesuit.length > 0) return samesuit;
	if (trump) {
		const trumpCards = hand.filter((c) => c.suit === trump);
		if (trumpCards.length > 0) return trumpCards;
	}
	return hand; // Any card
}

export function isValidPlay(
	card: Card,
	hand: Card[],
	trick: Trick | null,
	trump: Suit | null
): boolean {
	const valid = validCards(hand, trick, trump);
	return valid.some((c) => c.suit === card.suit && c.rank === card.rank);
}

// ─── State machine ────────────────────────────────────────────────────────────

export function createInitialState(gameId: string, playerIds: PlayerId[]): GameState {
	return {
		id: gameId,
		phase: 'waiting',
		playerIds,
		currentPlayerId: null,
		hands: {},
		widow: [],
		currentTrick: null,
		completedTricks: [],
		bids: [],
		contract: null,
		declarerId: null,
		trump: null,
		scores: Object.fromEntries(playerIds.map((p) => [p, 0])),
		roundNumber: 0,
		finishProposal: null,
		pauseProposal: null,
		pausedUntil: null
	};
}

export function startRound(state: GameState): GameState {
	const deck = createDeck();
	const { hands, widow } = deal(deck, state.playerIds);
	return {
		...state,
		phase: 'bidding',
		hands,
		widow,
		currentTrick: null,
		completedTricks: [],
		bids: [],
		contract: null,
		declarerId: null,
		trump: null,
		finishProposal: null,
		pauseProposal: null,
		pausedUntil: null,
		currentPlayerId: state.playerIds[state.roundNumber % state.playerIds.length],
		roundNumber: state.roundNumber + 1
	};
}

export function applyBid(state: GameState, playerId: PlayerId, bid: Bid): GameState {
	if (state.phase !== 'bidding' || state.currentPlayerId !== playerId) {
		throw new Error('Not your turn to bid');
	}
	const currentHigh = state.bids
		.filter((b) => b.bid !== 'pass')
		.map((b) => b.bid as Contract)
		.reduce<Contract | null>(
			(best, c) => (!best || contractValue(c) > contractValue(best) ? c : best),
			null
		);

	if (!isValidBid(bid, currentHigh)) {
		throw new Error('Bid is not high enough');
	}

	const newBids = [...state.bids, { playerId, bid }];
	const nextIdx = (state.playerIds.indexOf(playerId) + 1) % state.playerIds.length;

	// Check if bidding is over (all 3 have bid, or all passed)
	const passCount = newBids.filter((b) => b.bid === 'pass').length;
	const activeBidders = state.playerIds.length - passCount;

	if (newBids.length >= state.playerIds.length || activeBidders <= 1) {
		const { contract, declarerId } = resolveBidding(newBids);
		if (!contract || !declarerId) {
			// All passed — redeal (simplified: restart round)
			return startRound({ ...state, bids: newBids });
		}
		return {
			...state,
			bids: newBids,
			contract,
			declarerId,
			phase: 'widow',
			currentPlayerId: declarerId
		};
	}

	return {
		...state,
		bids: newBids,
		currentPlayerId: state.playerIds[nextIdx]
	};
}

export function applyWidowSelection(
	state: GameState,
	playerId: PlayerId,
	keep: [Card, Card]
): GameState {
	if (state.phase !== 'widow' || state.declarerId !== playerId) {
		throw new Error('Not your turn to select widow');
	}
	// Declarer takes widow into hand, then must discard 2 cards
	const hand = [...(state.hands[playerId] ?? []), ...state.widow];
	const discardedHand = hand.filter(
		(c) => !keep.some((k) => k.suit === c.suit && k.rank === c.rank)
	);
	if (discardedHand.length !== hand.length - 2) {
		throw new Error('Invalid widow selection: selected cards not found in hand');
	}
	return {
		...state,
		phase: 'playing',
		hands: { ...state.hands, [playerId]: discardedHand },
		widow: keep,
		currentPlayerId: state.declarerId
	};
}

export function applyPlayCard(state: GameState, playerId: PlayerId, card: Card): GameState {
	if (state.phase !== 'playing' || state.currentPlayerId !== playerId) {
		throw new Error('Not your turn to play');
	}
	const hand = state.hands[playerId] ?? [];
	if (!isValidPlay(card, hand, state.currentTrick, state.trump)) {
		throw new Error('Invalid card play');
	}

	const trick: Trick = state.currentTrick ?? {
		cards: [],
		winnerId: null,
		leadSuit: card.suit
	};

	const newTrick: Trick = {
		...trick,
		cards: [...trick.cards, { playerId, card }]
	};

	const newHand = hand.filter((c) => !(c.suit === card.suit && c.rank === card.rank));
	const newHands = { ...state.hands, [playerId]: newHand };

	const nextIdx = (state.playerIds.indexOf(playerId) + 1) % state.playerIds.length;

	// Check if trick is complete (all 3 players have played)
	if (newTrick.cards.length === state.playerIds.length) {
		const winnerId = trickWinner(newTrick, state.trump);
		const completedTrick: Trick = { ...newTrick, winnerId };
		const completedTricks = [...state.completedTricks, completedTrick];

		// Check if round is over (all 10 tricks played)
		if (completedTricks.length === 10) {
			const roundScores = scoreRound(
				state.contract!,
				state.declarerId!,
				state.playerIds,
				completedTricks
			);
			const newScores: Record<PlayerId, number> = { ...state.scores };
			for (const [pid, delta] of Object.entries(roundScores)) {
				newScores[pid] = (newScores[pid] ?? 0) + delta;
			}
			return {
				...state,
				hands: newHands,
				currentTrick: null,
				completedTricks,
				phase: 'scoring',
				currentPlayerId: null,
				scores: newScores
			};
		}

		return {
			...state,
			hands: newHands,
			currentTrick: null,
			completedTricks,
			currentPlayerId: winnerId
		};
	}

	return {
		...state,
		hands: newHands,
		currentTrick: newTrick,
		currentPlayerId: state.playerIds[nextIdx]
	};
}
