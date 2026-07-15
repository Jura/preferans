/**
 * Preferans (Преферанс) game engine — Leningrad tournament convention (Ленинградка).
 *
 * Rules follow the classic Russian description (ru.wikipedia.org/wiki/Преферанс)
 * with the table-specific conventions from CONVENTIONS.md:
 * - распасовка prices escalate 2-4-6-6-6…, 0 tricks writes off one trick's price;
 * - during распасовка the widow cards dictate the lead suit of the first two tricks;
 * - выход из распасовки only via a played game with at least one whister;
 * - whisting is gentlemanly (джентльменский) and half-responsible (полуответственный);
 * - half-whist (полвиста) allowed on 6 and 7 contracts, whist return (возврат виста)
 *   allowed on 6-8 contracts, "вист-пас-полвиста" (downgrade) allowed;
 * - misère is outbid by any 9-level game, no "без прикупа", no split misère;
 * - the first card of a deal is played "втемную": whisters choose light/dark after it;
 * - the mountain (гора) is written double for a failed contract (Leningrad scoring).
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
}

export type Contract = SuitContract | MisereContract;
export type Bid = Contract | 'pass';

export type PlayerId = string;

/** Declarations available to defenders during the whisting phase */
export type WhistChoice = 'whist' | 'pass' | 'half_whist';

export type GamePhase =
	| 'waiting'
	| 'dealing'
	| 'bidding'
	| 'widow'
	| 'discard'
	| 'whisting'
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

/** Result of a finished deal, kept for display during the scoring phase */
export interface RoundSummary {
	roundNumber: number;
	declarerId: PlayerId | null;
	contract: Contract | null;
	raspass: boolean;
	/** true when the contract was played out (not thrown in via pass/half-whist) */
	played: boolean;
	/** whether declarer fulfilled the contract (true for распасовка) */
	success: boolean;
	tricksTaken: Record<PlayerId, number>;
	poolDelta: Record<PlayerId, number>;
	mountainDelta: Record<PlayerId, number>;
	/** net whist points earned this deal (positive = written against opponents) */
	whistsDelta: Record<PlayerId, number>;
}

export interface GameState {
	id: string;
	phase: GamePhase;
	playerIds: PlayerId[];
	currentPlayerId: PlayerId | null;
	hands: Record<PlayerId, Card[]>;
	widow: Card[];
	/** Cards discarded by declarer (hidden from everyone) */
	discarded: Card[];
	currentTrick: Trick | null;
	completedTricks: Trick[];
	bids: { playerId: PlayerId; bid: Bid }[];
	/** Auction-winning bid — the minimum the declarer may announce */
	wonBid: Contract | null;
	/** Final announced contract (after the widow exchange) */
	contract: Contract | null;
	declarerId: PlayerId | null;
	trump: Suit | null;
	/** Whist declarations in order */
	whistDeclarations: { playerId: PlayerId; choice: WhistChoice }[];
	/** Defenders actually whisting during play */
	whisters: PlayerId[];
	/** Set when a defender returned the whist after "пас-полвиста" (возврат виста) */
	whistReturnerId: PlayerId | null;
	/** Players whose hands are revealed to everyone (открытая игра) */
	openHands: PlayerId[];
	/** Whister who must choose light/dark after the first card of the deal */
	lightDecisionBy: PlayerId | null;
	playedOpen: boolean;
	/** true while an all-pass deal (распасовка) is being played */
	raspass: boolean;
	/** Number of consecutive распасовки before the current deal (drives the price) */
	raspassStreak: number;
	/** Player left of the dealer — leads the bidding and the first trick */
	firstHandId: PlayerId | null;
	/** Пуля per player */
	pool: Record<PlayerId, number>;
	/** Гора per player */
	mountain: Record<PlayerId, number>;
	/** whists[a][b] — whist points player a holds against player b */
	whists: Record<PlayerId, Record<PlayerId, number>>;
	/** Pool size that closes the game */
	bulletTarget: number;
	/** Running final settlement in whists (display only, recomputed after each deal) */
	scores: Record<PlayerId, number>;
	roundNumber: number;
	roundSummary: RoundSummary | null;
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

/** Bidding order of suits within a level (spades lowest, no-trump highest) */
const SUIT_BID_ORDER: Record<ContractSuit, number> = {
	spades: 1,
	clubs: 2,
	diamonds: 3,
	hearts: 4,
	no_trump: 5
};

/** Price of one trick / game unit per contract level */
export const GAME_PRICE: Record<ContractLevel, number> = {
	6: 2,
	7: 4,
	8: 6,
	9: 8,
	10: 10
};

export const MISERE_PRICE = 10;

/** Total tricks the whisting side is obliged to take (десятерная «проверяется») */
export const WHIST_OBLIGATION: Record<ContractLevel, number> = {
	6: 4,
	7: 2,
	8: 1,
	9: 1,
	10: 0
};

/** Распасовка prices escalate 2-4-6 and stay at 6 (convention) */
const RASPASS_PRICES = [2, 4, 6];

export function raspassPrice(streak: number): number {
	return RASPASS_PRICES[Math.min(Math.max(streak, 0), RASPASS_PRICES.length - 1)];
}

export function contractPrice(c: Contract): number {
	return c.type === 'misere' ? MISERE_PRICE : GAME_PRICE[c.level];
}

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

function sameCard(a: Card, b: Card): boolean {
	return a.suit === b.suit && a.rank === b.rank;
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

/**
 * Total ordering of bids. Suit contracts order by level then suit
 * (6♠ < 6♣ < 6♦ < 6♥ < 6БК < 7♠ < …). Misère sits between 8БК and 9♠
 * («мизер перебивается девятерной»).
 */
export function contractValue(c: Contract): number {
	if (c.type === 'misere') return 850;
	return c.level * 100 + SUIT_BID_ORDER[c.suit];
}

export function isValidBid(bid: Bid, currentHigh: Contract | null): boolean {
	if (bid === 'pass') return true;
	if (!currentHigh) return true;
	return contractValue(bid) > contractValue(currentHigh);
}

export function currentHighBid(bids: { playerId: PlayerId; bid: Bid }[]): {
	contract: Contract | null;
	playerId: PlayerId | null;
} {
	let best: { contract: Contract; playerId: PlayerId } | null = null;
	for (const { playerId, bid } of bids) {
		if (bid === 'pass') continue;
		if (!best || contractValue(bid) > contractValue(best.contract)) {
			best = { contract: bid, playerId };
		}
	}
	return best
		? { contract: best.contract, playerId: best.playerId }
		: { contract: null, playerId: null };
}

function hasPassed(state: GameState, playerId: PlayerId): boolean {
	return state.bids.some((b) => b.playerId === playerId && b.bid === 'pass');
}

function seatAfter(state: GameState, playerId: PlayerId, steps = 1): PlayerId {
	const idx = state.playerIds.indexOf(playerId);
	return state.playerIds[(idx + steps) % state.playerIds.length];
}

function nextActiveBidder(state: GameState, fromPlayerId: PlayerId): PlayerId | null {
	for (let step = 1; step <= state.playerIds.length; step++) {
		const candidate = seatAfter(state, fromPlayerId, step);
		if (!hasPassed(state, candidate)) return candidate;
	}
	return null;
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function zeroRecord(playerIds: PlayerId[]): Record<PlayerId, number> {
	return Object.fromEntries(playerIds.map((p) => [p, 0]));
}

function tricksByPlayer(state: GameState): Record<PlayerId, number> {
	const counts = zeroRecord(state.playerIds);
	for (const trick of state.completedTricks) {
		if (trick.winnerId) counts[trick.winnerId] = (counts[trick.winnerId] ?? 0) + 1;
	}
	return counts;
}

/**
 * Final settlement in whists (classic расчёт, recomputed after every deal):
 * - гора: (average mountain − own mountain) × 10;
 * - пуля: (own pool − average pool) × 10;
 * - висты: net balance against each opponent.
 */
export function settle(state: GameState): Record<PlayerId, number> {
	const n = state.playerIds.length;
	const sumMountain = state.playerIds.reduce((s, p) => s + (state.mountain[p] ?? 0), 0);
	const sumPool = state.playerIds.reduce((s, p) => s + (state.pool[p] ?? 0), 0);
	const scores: Record<PlayerId, number> = {};
	for (const p of state.playerIds) {
		let whistBalance = 0;
		for (const q of state.playerIds) {
			if (q === p) continue;
			whistBalance += (state.whists[p]?.[q] ?? 0) - (state.whists[q]?.[p] ?? 0);
		}
		const mountainPart = (sumMountain / n - (state.mountain[p] ?? 0)) * 10;
		const poolPart = ((state.pool[p] ?? 0) - sumPool / n) * 10;
		scores[p] = Math.round(mountainPart + poolPart + whistBalance);
	}
	return scores;
}

interface DealOutcome {
	played: boolean;
	success: boolean;
	tricksTaken: Record<PlayerId, number>;
	pool: Record<PlayerId, number>;
	mountain: Record<PlayerId, number>;
	/** whist points written against the declarer, per player */
	whistsVsDeclarer: Record<PlayerId, number>;
}

/** Score a suit/no-trump or misère contract. `declarerTricks` may be virtual (thrown-in deals). */
function scoreContract(state: GameState, declarerTricks: number, played: boolean): DealOutcome {
	const contract = state.contract!;
	const declarerId = state.declarerId!;
	const defenders = state.playerIds.filter((p) => p !== declarerId);
	const price = contractPrice(contract);
	const pool = zeroRecord(state.playerIds);
	const mountain = zeroRecord(state.playerIds);
	const whistsVsDeclarer = zeroRecord(state.playerIds);
	const tricksTaken = played ? tricksByPlayer(state) : zeroRecord(state.playerIds);

	if (contract.type === 'misere') {
		const success = declarerTricks === 0;
		if (success) {
			pool[declarerId] += MISERE_PRICE;
		} else {
			// Leningrad scoring: mountain is written double for a failed contract
			mountain[declarerId] += 2 * MISERE_PRICE * declarerTricks;
			for (const def of defenders) {
				whistsVsDeclarer[def] += MISERE_PRICE * declarerTricks;
			}
		}
		return { played, success, tricksTaken, pool, mountain, whistsVsDeclarer };
	}

	const level = contract.level;
	const success = declarerTricks >= level;
	const undertricks = success ? 0 : level - declarerTricks;
	const halfWhister = state.whistDeclarations.find((d) => d.choice === 'half_whist')?.playerId;
	const halfWhistStands =
		halfWhister !== undefined && !state.whisters.includes(state.whistReturnerId ?? '');

	if (success) {
		pool[declarerId] += price;
	} else {
		mountain[declarerId] += 2 * price * undertricks;
		// Everyone at the table writes whists for the undertricks («за подсад»),
		// except when the whist was returned — then the returner takes them all.
		if (state.whistReturnerId) {
			whistsVsDeclarer[state.whistReturnerId] += price * undertricks * defenders.length;
		} else {
			for (const def of defenders) {
				whistsVsDeclarer[def] += price * undertricks;
			}
		}
	}

	if (played) {
		const defendersTricks = defenders.reduce((s, d) => s + (tricksTaken[d] ?? 0), 0);
		if (state.whisters.length === 1) {
			// Lone whister writes whists for all the defenders' tricks («за того парня»)
			const whister = state.whisters[0];
			const trickWhists = price * defendersTricks;
			if (state.whistReturnerId === whister) {
				whistsVsDeclarer[whister] += trickWhists;
			} else {
				// Gentleman's whist: the passing partner receives half of the trick whists
				const passer = defenders.find((d) => d !== whister)!;
				whistsVsDeclarer[whister] += Math.ceil(trickWhists / 2);
				whistsVsDeclarer[passer] += Math.floor(trickWhists / 2);
			}
		} else if (state.whisters.length === 2) {
			for (const def of defenders) {
				whistsVsDeclarer[def] += price * (tricksTaken[def] ?? 0);
			}
		}

		// Half-responsible whist: whisters cover half the price of missing
		// obligatory tricks with their mountain (both are responsible on 8-9).
		if (success && state.whisters.length > 0) {
			const missing = Math.max(0, WHIST_OBLIGATION[level] - defendersTricks);
			if (missing > 0) {
				const totalPenalty = (price * missing) / 2;
				const per = totalPenalty / state.whisters.length;
				state.whisters.forEach((w, i) => {
					mountain[w] += i === 0 ? Math.ceil(per) : Math.floor(per);
				});
			}
		}
	} else if (halfWhistStands && halfWhister) {
		// Half-whist: half the whists for the obligatory tricks, without play
		whistsVsDeclarer[halfWhister] += (price * WHIST_OBLIGATION[level]) / 2;
	}

	return { played, success, tricksTaken, pool, mountain, whistsVsDeclarer };
}

/** Score a распасовка: every trick costs the current pass-game price. */
function scoreRaspass(state: GameState): DealOutcome {
	const price = raspassPrice(state.raspassStreak);
	const tricksTaken = tricksByPlayer(state);
	const mountain = zeroRecord(state.playerIds);
	for (const p of state.playerIds) {
		const t = tricksTaken[p] ?? 0;
		if (t > 0) {
			mountain[p] += t * price;
		} else {
			// «За 0 взяток списывается с горы цена 1 взятки»
			mountain[p] -= Math.min(state.mountain[p] ?? 0, price);
		}
	}
	return {
		played: true,
		success: true,
		tricksTaken,
		pool: zeroRecord(state.playerIds),
		mountain,
		whistsVsDeclarer: zeroRecord(state.playerIds)
	};
}

/** Apply a deal outcome to the running score sheets and close the deal. */
function applyOutcome(state: GameState, outcome: DealOutcome): GameState {
	const pool = { ...state.pool };
	const mountain = { ...state.mountain };
	const whists: Record<PlayerId, Record<PlayerId, number>> = Object.fromEntries(
		state.playerIds.map((p) => [p, { ...(state.whists[p] ?? {}) }])
	);
	const whistsDelta = zeroRecord(state.playerIds);

	for (const p of state.playerIds) {
		pool[p] = (pool[p] ?? 0) + (outcome.pool[p] ?? 0);
		mountain[p] = (mountain[p] ?? 0) + (outcome.mountain[p] ?? 0);
		if (state.declarerId && p !== state.declarerId && outcome.whistsVsDeclarer[p]) {
			whists[p][state.declarerId] =
				(whists[p][state.declarerId] ?? 0) + outcome.whistsVsDeclarer[p];
			whistsDelta[p] += outcome.whistsVsDeclarer[p];
			whistsDelta[state.declarerId] -= outcome.whistsVsDeclarer[p];
		}
	}

	// Консекутивная распасовка: streak grows on распасовка and is reset only by
	// a played game with at least one whister («выход любой завистованной игрой»).
	let raspassStreak = state.raspassStreak;
	if (state.raspass) {
		raspassStreak += 1;
	} else if (outcome.played && state.whisters.length > 0) {
		raspassStreak = 0;
	}

	const roundSummary: RoundSummary = {
		roundNumber: state.roundNumber,
		declarerId: state.declarerId,
		contract: state.contract,
		raspass: state.raspass,
		played: outcome.played,
		success: outcome.success,
		tricksTaken: outcome.tricksTaken,
		poolDelta: outcome.pool,
		mountainDelta: outcome.mountain,
		whistsDelta
	};

	const next: GameState = {
		...state,
		pool,
		mountain,
		whists,
		raspassStreak,
		roundSummary,
		currentTrick: null,
		currentPlayerId: null,
		lightDecisionBy: null,
		phase: 'scoring'
	};
	next.scores = settle(next);

	// The bullet closes when every player has filled the pool
	const finished = state.playerIds.every((p) => (next.pool[p] ?? 0) >= state.bulletTarget);
	if (finished) {
		next.phase = 'finished';
	}
	return next;
}

// ─── Move validation ──────────────────────────────────────────────────────────

/**
 * During распасовка the widow cards are turned over one at a time and dictate
 * the lead suit of the first two tricks («показывают масть хода»).
 */
export function requiredLeadSuit(state: GameState): Suit | null {
	if (!state.raspass) return null;
	if (state.currentTrick && state.currentTrick.cards.length > 0) return null;
	const trickIndex = state.completedTricks.length;
	if (trickIndex >= 2) return null;
	return state.widow[trickIndex]?.suit ?? null;
}

export function validCards(
	hand: Card[],
	trick: Trick | null,
	trump: Suit | null,
	forcedLeadSuit: Suit | null = null
): Card[] {
	if (!trick || trick.cards.length === 0) {
		// Leading — constrained only by the распасовка widow card
		if (forcedLeadSuit) {
			const forced = hand.filter((c) => c.suit === forcedLeadSuit);
			if (forced.length > 0) return forced;
		}
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
	trump: Suit | null,
	forcedLeadSuit: Suit | null = null
): boolean {
	const valid = validCards(hand, trick, trump, forcedLeadSuit);
	return valid.some((c) => sameCard(c, card));
}

// ─── State machine ────────────────────────────────────────────────────────────

export function createInitialState(
	gameId: string,
	playerIds: PlayerId[],
	bulletTarget = 100
): GameState {
	return {
		id: gameId,
		phase: 'waiting',
		playerIds,
		currentPlayerId: null,
		hands: {},
		widow: [],
		discarded: [],
		currentTrick: null,
		completedTricks: [],
		bids: [],
		wonBid: null,
		contract: null,
		declarerId: null,
		trump: null,
		whistDeclarations: [],
		whisters: [],
		whistReturnerId: null,
		openHands: [],
		lightDecisionBy: null,
		playedOpen: false,
		raspass: false,
		raspassStreak: 0,
		firstHandId: null,
		pool: zeroRecord(playerIds),
		mountain: zeroRecord(playerIds),
		whists: Object.fromEntries(playerIds.map((p) => [p, {}])),
		bulletTarget,
		scores: zeroRecord(playerIds),
		roundNumber: 0,
		roundSummary: null,
		finishProposal: null,
		pauseProposal: null,
		pausedUntil: null
	};
}

/** Fill defaults for states persisted by an older engine version. */
export function normalizeState(stored: GameState): GameState {
	const playerIds = stored.playerIds ?? [];
	return {
		...createInitialState(stored.id, playerIds, stored.bulletTarget ?? 100),
		...stored,
		discarded: stored.discarded ?? [],
		wonBid: stored.wonBid ?? null,
		whistDeclarations: stored.whistDeclarations ?? [],
		whisters: stored.whisters ?? [],
		whistReturnerId: stored.whistReturnerId ?? null,
		openHands: stored.openHands ?? [],
		lightDecisionBy: stored.lightDecisionBy ?? null,
		playedOpen: stored.playedOpen ?? false,
		raspass: stored.raspass ?? false,
		raspassStreak: stored.raspassStreak ?? 0,
		firstHandId: stored.firstHandId ?? null,
		pool: stored.pool ?? zeroRecord(playerIds),
		mountain: stored.mountain ?? zeroRecord(playerIds),
		whists: stored.whists ?? Object.fromEntries(playerIds.map((p) => [p, {}])),
		bulletTarget: stored.bulletTarget ?? 100,
		roundSummary: stored.roundSummary ?? null,
		finishProposal: stored.finishProposal ?? null,
		pauseProposal: stored.pauseProposal ?? null,
		pausedUntil: stored.pausedUntil ?? null
	};
}

export function startRound(state: GameState): GameState {
	const deck = createDeck();
	const { hands, widow } = deal(deck, state.playerIds);
	// «Переход сдачи — по часовой стрелке, независимо от того, что произошло»
	const firstHandId = state.playerIds[state.roundNumber % state.playerIds.length];
	return {
		...state,
		phase: 'bidding',
		hands,
		widow,
		discarded: [],
		currentTrick: null,
		completedTricks: [],
		bids: [],
		wonBid: null,
		contract: null,
		declarerId: null,
		trump: null,
		whistDeclarations: [],
		whisters: [],
		whistReturnerId: null,
		openHands: [],
		lightDecisionBy: null,
		playedOpen: false,
		raspass: false,
		firstHandId,
		roundSummary: null,
		finishProposal: null,
		pauseProposal: null,
		pausedUntil: null,
		currentPlayerId: firstHandId,
		roundNumber: state.roundNumber + 1
	};
}

export function applyBid(state: GameState, playerId: PlayerId, bid: Bid): GameState {
	if (state.phase !== 'bidding' || state.currentPlayerId !== playerId) {
		throw new Error('Not your turn to bid');
	}

	const myBids = state.bids.filter((b) => b.playerId === playerId);
	if (bid !== 'pass') {
		if (myBids.some((b) => b.bid !== 'pass' && b.bid.type === 'misere')) {
			throw new Error('After declaring misère you may only pass');
		}
		if (bid.type === 'misere' && myBids.some((b) => b.bid !== 'pass')) {
			throw new Error('Misère may only be declared as your first bid');
		}
		const { contract: high } = currentHighBid(state.bids);
		if (!isValidBid(bid, high)) {
			throw new Error('Bid is not high enough');
		}
	}

	const next: GameState = { ...state, bids: [...state.bids, { playerId, bid }] };
	const active = next.playerIds.filter((p) => !hasPassed(next, p));

	if (active.length === 0) {
		// All three passed — распасовка is played instead of a redeal
		return {
			...next,
			raspass: true,
			phase: 'playing',
			trump: null,
			currentPlayerId: next.firstHandId
		};
	}

	if (active.length === 1) {
		const { contract, playerId: winnerId } = currentHighBid(next.bids);
		if (contract && winnerId === active[0]) {
			return {
				...next,
				wonBid: contract,
				declarerId: winnerId,
				phase: 'widow',
				currentPlayerId: winnerId
			};
		}
		// The remaining player has not bid yet (the other two passed first)
		return { ...next, currentPlayerId: active[0] };
	}

	return { ...next, currentPlayerId: nextActiveBidder(next, playerId) };
}

/**
 * Declarer takes the widow, discards two cards and announces the final
 * contract (at least as high as the winning bid). A misère bid stays misère.
 */
export function applyWidowSelection(
	state: GameState,
	playerId: PlayerId,
	discard: [Card, Card],
	contract: Contract
): GameState {
	if (state.phase !== 'widow' || state.declarerId !== playerId) {
		throw new Error('Not your turn to take the widow');
	}
	if (!state.wonBid) throw new Error('No winning bid');

	if (sameCard(discard[0], discard[1])) {
		throw new Error('The two discarded cards must be different');
	}
	const combined = [...(state.hands[playerId] ?? []), ...state.widow];
	for (const c of discard) {
		if (!combined.some((h) => sameCard(h, c))) {
			throw new Error('Discarded card is not in your hand');
		}
	}

	if (state.wonBid.type === 'misere') {
		if (contract.type !== 'misere') {
			throw new Error('A misère bid must be played as misère');
		}
	} else {
		if (contract.type !== 'suit') {
			throw new Error('Announce a suit or no-trump contract');
		}
		if (contractValue(contract) < contractValue(state.wonBid)) {
			throw new Error('Final contract cannot be lower than the winning bid');
		}
	}

	const newHand = combined.filter((c) => !discard.some((d) => sameCard(d, c)));
	const trump =
		contract.type === 'suit' && contract.suit !== 'no_trump' ? (contract.suit as Suit) : null;

	const next: GameState = {
		...state,
		hands: { ...state.hands, [playerId]: newHand },
		widow: [],
		discarded: [...discard],
		contract,
		trump
	};

	if (contract.type === 'misere') {
		// No whisting on misère — defenders simply try to catch the declarer
		return { ...next, phase: 'playing', currentPlayerId: next.firstHandId };
	}

	const firstDefender = seatAfter(next, playerId);
	return { ...next, phase: 'whisting', currentPlayerId: firstDefender };
}

// ─── Whisting ─────────────────────────────────────────────────────────────────

function defendersInOrder(state: GameState): PlayerId[] {
	const declarer = state.declarerId!;
	return [seatAfter(state, declarer, 1), seatAfter(state, declarer, 2)];
}

/**
 * Options for the player whose whist declaration is awaited, or null when the
 * whisting phase is resolved. Implements the convention specifics:
 * half-whist on 6-7, whist return («пас-полвиста-вист») on 6-8,
 * downgrade to half-whist after «вист-пас».
 */
export function whistOptions(
	state: GameState
): { playerId: PlayerId; options: WhistChoice[] } | null {
	if (state.phase !== 'whisting' || !state.contract || state.contract.type !== 'suit') return null;
	const level = state.contract.level;
	const [d0, d1] = defendersInOrder(state);
	const decls = state.whistDeclarations;

	if (decls.length === 0) {
		return { playerId: d0, options: ['whist', 'pass'] };
	}
	if (decls.length === 1) {
		const options: WhistChoice[] =
			decls[0].choice === 'pass' && level <= 7
				? ['whist', 'pass', 'half_whist']
				: ['whist', 'pass'];
		return { playerId: d1, options };
	}
	if (decls.length === 2) {
		const [c0, c1] = [decls[0].choice, decls[1].choice];
		if (c0 === 'whist' && c1 === 'pass' && level <= 7) {
			// «уход за полвиста в контрактах 6 и 7»
			return { playerId: d0, options: ['whist', 'half_whist'] };
		}
		if (c0 === 'pass' && c1 === 'half_whist' && level <= 8) {
			// «возврат виста только на контрактах 6-7-8»
			return { playerId: d0, options: ['pass', 'whist'] };
		}
	}
	return null;
}

export function applyWhistChoice(
	state: GameState,
	playerId: PlayerId,
	choice: WhistChoice
): GameState {
	const awaiting = whistOptions(state);
	if (!awaiting || awaiting.playerId !== playerId) {
		throw new Error('Not your turn to declare whist');
	}
	if (!awaiting.options.includes(choice)) {
		throw new Error('This declaration is not allowed');
	}

	const next: GameState = {
		...state,
		whistDeclarations: [...state.whistDeclarations, { playerId, choice }]
	};

	const pending = whistOptions(next);
	if (pending) {
		return { ...next, currentPlayerId: pending.playerId };
	}
	return resolveWhisting(next);
}

function resolveWhisting(state: GameState): GameState {
	const [d0, d1] = defendersInOrder(state);
	const decls = state.whistDeclarations;
	const last = (pid: PlayerId): WhistChoice =>
		[...decls].reverse().find((d) => d.playerId === pid)!.choice;

	const whisters = [d0, d1].filter((d) => last(d) === 'whist');
	// «пас-полвиста-вист» — the first defender returned the whist
	const whistReturnerId =
		decls.length === 3 && decls[0].choice === 'pass' && last(d0) === 'whist' ? d0 : null;

	if (whisters.length > 0) {
		return {
			...state,
			whisters,
			whistReturnerId,
			phase: 'playing',
			currentPlayerId: state.firstHandId
		};
	}

	// Nobody plays against the contract — it is written as won without play,
	// a standing half-whist earns half the obligatory whists.
	const withSides: GameState = { ...state, whisters: [], whistReturnerId: null };
	const outcome = scoreContract(
		withSides,
		withSides.contract!.type === 'suit' ? withSides.contract!.level : 0,
		false
	);
	return applyOutcome(withSides, outcome);
}

// ─── Light/dark decision and card play ───────────────────────────────────────

export function applyLightChoice(state: GameState, playerId: PlayerId, open: boolean): GameState {
	if (state.phase !== 'playing' || state.lightDecisionBy !== playerId) {
		throw new Error('No light/dark decision is awaited from you');
	}
	if (!open) {
		return { ...state, lightDecisionBy: null, playedOpen: false };
	}
	// Светлая: both defenders lay their cards open on the table
	const defenders = state.playerIds.filter((p) => p !== state.declarerId);
	const openHands = [...new Set([...state.openHands, ...defenders])];
	return { ...state, lightDecisionBy: null, playedOpen: true, openHands };
}

export function applyPlayCard(state: GameState, playerId: PlayerId, card: Card): GameState {
	if (state.phase !== 'playing' || state.currentPlayerId !== playerId) {
		throw new Error('Not your turn to play');
	}
	if (state.lightDecisionBy) {
		throw new Error('Waiting for the whisters to choose light or dark play');
	}
	const hand = state.hands[playerId] ?? [];
	if (!isValidPlay(card, hand, state.currentTrick, state.trump, requiredLeadSuit(state))) {
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

	const newHand = hand.filter((c) => !sameCard(c, card));
	let next: GameState = {
		...state,
		hands: { ...state.hands, [playerId]: newHand },
		currentTrick: newTrick
	};

	// The very first card of the deal is played «втемную»; right after it the
	// declarer's hand opens on misère, and whisters choose light/dark play.
	const isFirstCard = state.completedTricks.length === 0 && trick.cards.length === 0;
	if (isFirstCard && !state.raspass) {
		if (state.contract?.type === 'misere' && state.declarerId) {
			next = { ...next, openHands: [...new Set([...next.openHands, next.declarerId!])] };
		} else if (state.whisters.length > 0) {
			next = { ...next, lightDecisionBy: state.whisters[0] };
		}
	}

	// Trick complete?
	if (newTrick.cards.length === state.playerIds.length) {
		const winnerId = trickWinner(newTrick, state.trump);
		const completedTrick: Trick = { ...newTrick, winnerId };
		const completedTricks = [...next.completedTricks, completedTrick];
		next = { ...next, currentTrick: null, completedTricks, currentPlayerId: winnerId };

		if (completedTricks.length === 10) {
			const outcome = state.raspass
				? scoreRaspass(next)
				: scoreContract(next, tricksByPlayer(next)[next.declarerId!] ?? 0, true);
			return applyOutcome(next, outcome);
		}
		return next;
	}

	return { ...next, currentPlayerId: seatAfter(next, playerId) };
}
