// Turns Jev's per-word fit scores for a clue into the number a spymaster should say.
// A red word counts only if it fits well on its own and clearly beats every word
// the guesser must not pick, so the number never invites a risky extra guess.

import type { Card, Team } from './game.ts';
import type { Rating } from './rubric.ts';

/** A red word must reach at least this fit (between Moderate and Strong). */
const MIN_FIT = 2.5;
/** ...and beat the riskiest non-red word by this much. */
const MARGIN = 0.5;
/** Any clue fitting the assassin this well (Moderate) is rejected outright. */
const ASSASSIN_LIMIT = 2;

export interface ClueNumber {
  /** How many red words the clue safely points to; 0 means don't use it. */
  number: number;
  /** The red words that count, best fit first. */
  targets: { word: string; score: number }[];
  /** The non-red word the clue fits best: the guess most likely to go wrong. */
  risk: { word: string; team: Team; score: number } | null;
  threshold: number;
  /** True when the clue points at the assassin too strongly to use. */
  unsafe: boolean;
}

export function clueNumber(board: Card[], ratings: Record<string, Rating>): ClueNumber {
  const hidden = board.filter((c) => !c.revealed && ratings[c.word]);
  const fit = (c: Card) => ratings[c.word].score;

  const risk =
    hidden
      .filter((c) => c.team !== 'red')
      .map((c) => ({ word: c.word, team: c.team, score: fit(c) }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
  const assassin = hidden.find((c) => c.team === 'assassin');
  const unsafe = assassin !== undefined && fit(assassin) >= ASSASSIN_LIMIT;

  const threshold = Math.max(MIN_FIT, (risk?.score ?? 0) + MARGIN);
  const targets = unsafe
    ? []
    : hidden
        .filter((c) => c.team === 'red' && fit(c) >= threshold)
        .map((c) => ({ word: c.word, score: fit(c) }))
        .sort((a, b) => b.score - a.score);

  return { number: targets.length, targets, risk, threshold, unsafe };
}
