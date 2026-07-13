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

/** Trump suit bids: 6/7/8/9/10 tricks in a suit, or misere/grand */
export type ContractSuit = Suit | 'no_trump';
export type ContractLevel = 6 | 7 | 8 | 9 | 10;

export interface SuitContract {
	type: 'suit';
	level: ContractLevel;
	suit: ContractSuit;
}

export interface MisereContract {
	type: 'misere';
	/** open misere (открытый мизер) */
	open: boolean;
}

export interface GrandContract {
	type: 'grand';
	level: ContractLevel;
	open: boolean;
}

export type Contract = SuitContract | MisereContract | GrandContract;

export type Bid = Contract | 'pass';

// ─── Player & Game types ──────────────────────────────────────────────────────

export type PlayerId = string;

export interface Player {
	id: PlayerId;
	name: string;
	avatarUrl: string | null;
	/** Position at table: 0 = south (self), 1 = west, 2 = east */
	position: 0 | 1 | 2;
}

export type GamePhase =
	| 'waiting'   // waiting for players
	| 'dealing'   // cards being dealt
	| 'bidding'   // auction round
	| 'widow'     // declarer looks at talon (прикуп)
	| 'discard'   // declarer discards 2 cards
	| 'playing'   // tricks being played
	| 'scoring'   // round over, scores shown
	| 'finished'; // game over

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
	/** Winning contract for this round */
	contract: Contract | null;
	/** Declarer player id */
	declarerId: PlayerId | null;
	/** Trump suit for the current round */
	trump: Suit | null;
	/** Cumulative scores across rounds */
	scores: Record<PlayerId, number>;
	/** Number of rounds played */
	roundNumber: number;
}

// ─── WebSocket message types ──────────────────────────────────────────────────

export type ClientMessage =
	| { type: 'join'; gameId: string; token: string }
	| { type: 'bid'; bid: Bid }
	| { type: 'select_widow'; keep: [Card, Card] }
	| { type: 'play_card'; card: Card }
	| { type: 'ping' };

export type ServerMessage =
	| { type: 'game_state'; state: GameState }
	| { type: 'player_joined'; player: Player }
	| { type: 'player_left'; playerId: PlayerId }
	| { type: 'bid_made'; playerId: PlayerId; bid: Bid }
	| { type: 'card_played'; playerId: PlayerId; card: Card }
	| { type: 'trick_won'; winnerId: PlayerId; trick: Trick }
	| { type: 'round_complete'; score: RoundScore }
	| { type: 'game_over'; scores: Record<PlayerId, number> }
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
