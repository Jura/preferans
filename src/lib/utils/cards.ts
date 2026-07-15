import type { Card, Suit, Trick } from '$lib/types/preferans';
import { RANK_ORDER } from '$lib/types/preferans';

const SUIT_COLOR: Record<Suit, 'black' | 'red'> = {
	spades: 'black',
	clubs: 'black',
	diamonds: 'red',
	hearts: 'red'
};

/**
 * Sort a hand of cards for display:
 * - Group by suit; shortest suit on the left, longest on the right
 * - Alternate colors (black / red) left-to-right
 * - Within each suit sort by rank ascending: 7 (left) → A (right)
 */
export function sortHand(cards: Card[]): Card[] {
	if (cards.length === 0) return [];

	// Group by suit
	const bySuit = new Map<Suit, Card[]>();
	for (const card of cards) {
		if (!bySuit.has(card.suit)) bySuit.set(card.suit, []);
		bySuit.get(card.suit)!.push(card);
	}

	// Sort within each suit by rank ascending (7 → A)
	for (const suitCards of bySuit.values()) {
		suitCards.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
	}

	// Sort suits by card count ascending (shortest → longest)
	const sortedSuits = [...bySuit.keys()].sort(
		(a, b) => bySuit.get(a)!.length - bySuit.get(b)!.length
	);

	// Separate into black and red, maintaining count-ascending order within each colour
	const black = sortedSuits.filter((s) => SUIT_COLOR[s] === 'black');
	const red = sortedSuits.filter((s) => SUIT_COLOR[s] === 'red');

	// Interleave black/red so adjacent suits alternate colours.
	// Both groups are already sorted shortest→longest, so interleaving them preserves
	// the approximate left=short, right=long ordering while alternating colours.
	const ordered: Suit[] = [];
	const maxLen = Math.max(black.length, red.length);
	for (let i = 0; i < maxLen; i++) {
		if (i < black.length) ordered.push(black[i]);
		if (i < red.length) ordered.push(red[i]);
	}

	return ordered.flatMap((s) => bySuit.get(s)!);
}

/**
 * Returns the subset of `hand` that is legal to play in the current situation.
 * Mirrors the engine's `validCards()` function so the client can apply the same
 * rules locally (for disabling illegal cards and auto-playing forced plays).
 *
 * @param hand - Player's current hand
 * @param trick - The trick in progress (null or empty = player leads)
 * @param trump - Trump suit for the round (null = no-trump / misère)
 * @param forcedLeadSuit - During распасовка, the widow-dictated lead suit
 */
export function validCardsForPlay(
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
	const sameSuit = hand.filter((c) => c.suit === leadSuit);
	if (sameSuit.length > 0) return sameSuit;
	if (trump) {
		const trumpCards = hand.filter((c) => c.suit === trump);
		if (trumpCards.length > 0) return trumpCards;
	}
	return hand; // Any card
}
