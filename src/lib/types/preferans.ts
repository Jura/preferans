// ─── Card types ──────────────────────────────────────────────────────────────

export type Suit = 'spades' | 'clubs' | 'diamonds' | 'hearts';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
	suit: Suit;
	rank: Rank;
}

/** Russian display names */
export const SUIT_NAMES: Record<Suit, string> = {
	spades: 'Пики',
	clubs: 'Трефы',
	diamonds: 'Бубны',
	hearts: 'Червы'
};

export const RANK_NAMES: Record<Rank, string> = {
	'7': '7',
	'8': '8',
	'9': '9',
	'10': '10',
	J: 'Валет',
	Q: 'Дама',
	K: 'Король',
	A: 'Туз'
};

/** Card rank ordering for comparisons (higher = stronger) */
export const RANK_ORDER: Record<Rank, number> = {
	'7': 0,
	'8': 1,
	'9': 2,
	'10': 3,
	J: 4,
	Q: 5,
	K: 6,
	A: 7
};

// ─── Bidding types ────────────────────────────────────────────────────────────

/** Trump suit bids: 6/7/8/9/10 tricks in a suit or no-trump, or misère */
export type ContractSuit = Suit | 'no_trump';
export type ContractLevel = 6 | 7 | 8 | 9 | 10;

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

/** Declarations available to defenders during the whisting phase */
export type WhistChoice = 'whist' | 'pass' | 'half_whist';

/**
 * Total ordering of bids (matches worker/src/gameEngine.ts). Suit contracts
 * order by level then suit (6♠ < 6♣ < 6♦ < 6♥ < 6БК < 7♠ < …). Misère sits
 * between 8БК and 9♠ («мизер перебивается девятерной»).
 */
export const SUIT_BID_ORDER: Record<ContractSuit, number> = {
	spades: 1,
	clubs: 2,
	diamonds: 3,
	hearts: 4,
	no_trump: 5
};

export function contractValue(c: Contract): number {
	if (c.type === 'misere') return 850;
	return c.level * 100 + SUIT_BID_ORDER[c.suit];
}

// ─── Player & Game types ──────────────────────────────────────────────────────

export type PlayerId = string;

export interface Player {
	id: PlayerId;
	name: string;
	avatarUrl: string | null;
	/** Position at table: 0 = south (self), 1 = west, 2 = east */
	position: 0 | 1 | 2;
	/** Whether the player currently has an active game WebSocket session. */
	isOnline: boolean;
}

export type GamePhase =
	| 'waiting' // waiting for players
	| 'dealing' // cards being dealt
	| 'bidding' // auction round
	| 'widow' // declarer takes the talon (прикуп) and discards
	| 'discard' // legacy alias, kept for translations
	| 'whisting' // defenders declare whist/pass/half-whist
	| 'playing' // tricks being played
	| 'scoring' // round over, scores shown
	| 'paused' // paused by unanimous vote
	| 'finished'; // game over

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

export interface RoundScore {
	/** Scores per player this round (positive = gain, negative = loss) */
	scores: Record<PlayerId, number>;
	/** Bullet points (пули) if applicable */
	bullets: Record<PlayerId, number>;
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
	/** net whist points earned this deal */
	whistsDelta: Record<PlayerId, number>;
}

export interface GameState {
	id: string;
	phase: GamePhase;
	players: Player[];
	/** Whose turn it is */
	currentPlayerId: PlayerId | null;
	/** Cards in hand per player (only own hand is populated on client) */
	hand: Card[];
	/** Widow/talon cards (shown only to declarer during widow phase) */
	widow: Card[];
	/** Current trick in progress */
	currentTrick: Trick | null;
	/** Completed tricks this round */
	completedTricks: Trick[];
	/** Current auction bids */
	bids: { playerId: PlayerId; bid: Bid }[];
	/** Auction-winning bid — the minimum the declarer may announce */
	wonBid: Contract | null;
	/** Final contract for this round */
	contract: Contract | null;
	/** Declarer player id */
	declarerId: PlayerId | null;
	/** Trump suit for the current round */
	trump: Suit | null;
	/** Whist declarations in order */
	whistDeclarations: { playerId: PlayerId; choice: WhistChoice }[];
	/** Whist options for THIS player, when their declaration is awaited */
	whistOptions: WhistChoice[] | null;
	/** Defenders actually whisting during play */
	whisters: PlayerId[];
	/** Whister who must choose light/dark after the first card of the deal */
	lightDecisionBy: PlayerId | null;
	playedOpen: boolean;
	/** Other players' hands revealed to everyone (открытая игра) */
	openHands: Record<PlayerId, Card[]>;
	/** true while an all-pass deal (распасовка) is being played */
	raspass: boolean;
	/** Current price of one trick during распасовка */
	raspassPrice: number;
	/** Widow card dictating the current lead suit during распасовка */
	raspassUpcard: Card | null;
	/** Пуля per player */
	pool: Record<PlayerId, number>;
	/** Гора per player */
	mountain: Record<PlayerId, number>;
	/** whists[a][b] — whist points player a holds against player b */
	whists: Record<PlayerId, Record<PlayerId, number>>;
	/** Pool size that closes the game */
	bulletTarget: number;
	/** Running final settlement in whists */
	scores: Record<PlayerId, number>;
	/** Number of rounds played */
	roundNumber: number;
	/** Result of the last finished deal */
	roundSummary: RoundSummary | null;
	/** Pending unanimous finish proposal */
	finishProposal: FinishProposal | null;
	/** Pending unanimous pause proposal */
	pauseProposal: PauseProposal | null;
	/** Pause deadline (null = indefinite pause) */
	pausedUntil: string | null;
}

// ─── WebSocket message types ──────────────────────────────────────────────────

export type ClientMessage =
	| { type: 'join'; gameId: string; token: string }
	| { type: 'bid'; bid: Bid }
	| { type: 'select_widow'; discard: [Card, Card]; contract: Contract }
	| { type: 'whist'; choice: WhistChoice }
	| { type: 'choose_open'; open: boolean }
	| { type: 'play_card'; card: Card }
	| { type: 'start_round' }
	| { type: 'request_finish_early' }
	| { type: 'vote_finish_early'; approve: boolean }
	| { type: 'request_pause'; durationMinutes: number | null }
	| { type: 'vote_pause'; approve: boolean }
	| { type: 'ping' }
	| { type: 'activity' };

export type ServerMessage =
	| { type: 'game_state'; state: GameState }
	| { type: 'player_joined'; player: Player }
	| { type: 'player_left'; playerId: PlayerId }
	| { type: 'bid_made'; playerId: PlayerId; bid: Bid }
	| { type: 'card_played'; playerId: PlayerId; card: Card }
	| { type: 'trick_won'; winnerId: PlayerId; trick: Trick }
	| { type: 'round_complete'; score: RoundScore }
	| { type: 'game_over'; scores: Record<PlayerId, number> }
	| { type: 'proposal_started'; proposal: FinishProposal | PauseProposal }
	| { type: 'proposal_closed' }
	| { type: 'error'; message: string }
	| { type: 'pong' };

// ─── Lobby types ──────────────────────────────────────────────────────────────

export interface GameListing {
	id: string;
	hostName: string;
	playerCount: number;
	maxPlayers: 3;
	phase: GamePhase;
	createdAt: string;
}

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface UserPresence {
	id: string;
	name: string;
	status: PresenceStatus;
}

// ─── Lobby WebSocket message types ───────────────────────────────────────────

export type LobbyGame = {
	id: string;
	phase: string;
	created_at: string;
	host_name: string;
	player_count: number;
	bullet_target: number;
	is_pinned: number;
	paused_until: string | null;
};

export type LobbyClientMessage = { type: 'ping' } | { type: 'activity' };

export type LobbyServerMessage =
	| {
			type: 'lobby_state';
			games: LobbyGame[];
			users: UserPresence[];
	  }
	| {
			type: 'game_event';
			event: 'player_joined' | 'player_left';
			gameId: string;
			playerName: string;
	  }
	| { type: 'pong' }
	| { type: 'error'; message: string };
