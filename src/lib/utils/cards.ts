import type { Card, Suit } from '$lib/types/preferans';
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
