// The red spymaster's side of the game, shared by the app and scripts/clue-test.ts.
//
// Picking a clue: a choice question shortlists candidates from the clue bank, then
// each finalist is scored against every board word. clueNumber turns those scores
// into the number to say: a red word counts only if it fits well on its own and
// clearly beats every word the guesser must not pick, so the number never invites
// a risky extra guess.

import { CLUE_BANK } from './clueBank.ts';
import { validateClue, type Card, type Team } from './game.ts';
import type { Rating } from './rubric.ts';
import { WORDS } from './words.ts';

/** The API allows at most this many options in one choice question. */
export const MAX_CHOICE_OPTIONS = 255;

export const SPYMASTER_INSTRUCTIONS =
  'Which candidate clue would lead a guesser to the largest number of red words, without leading them to the assassin, blue words or neutral words?';

/** What Jev sees when choosing a clue: the hidden words, grouped by team. */
export function spymasterState(board: Card[]) {
  const hidden = (team: Team) => board.filter((c) => c.team === team && !c.revealed).map((c) => c.word);
  return {
    game: 'Codenames',
    role: "You are the red team's spymaster. Give one single-word clue that connects as many red words as possible.",
    redWords: hidden('red'),
    avoid: { assassin: hidden('assassin'), blueTeam: hidden('blue'), neutral: hidden('neutral') },
    rules:
      'A good clue strongly suggests several red words and does not suggest the assassin, blue words or neutral words. Pointing at the assassin loses the game instantly.',
  };
}

/** Every legal clue for this board: the clue bank plus the game's card words, minus clashes. */
export function clueCandidates(board: Card[], exclude: string[] = []): string[] {
  const skip = new Set(exclude);
  return [...new Set([...CLUE_BANK, ...WORDS])]
    .filter((w) => !skip.has(w) && validateClue(w, board) === null)
    .sort();
}

/** How many of each round 1 group's top picks go through to round 2. */
export const FINALISTS_PER_GROUP = 5;

/** The n options with the highest probability, best first. */
export const topOptions = (probabilities: Record<string, number>, n: number): [string, number][] =>
  Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

/** Deals options round-robin into groups small enough for one choice question each. */
export function splitOptions(options: string[], max = MAX_CHOICE_OPTIONS): string[][] {
  const groups: string[][] = Array.from({ length: Math.ceil(options.length / max) }, () => []);
  options.forEach((w, i) => groups[i % groups.length].push(w));
  return groups;
}

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

export interface CheckedClue extends ClueNumber {
  clue: string;
  /** Jev's shortlist probability for the clue. */
  probability: number;
}

/** How far the weakest counted red word clears the riskiest non-red word. */
export const gap = (c: ClueNumber) =>
  c.targets.length ? c.targets[c.targets.length - 1].score - (c.risk?.score ?? 0) : -Infinity;

/**
 * Best first: safe clues, then the most red words, then the widest gap, then
 * Jev's shortlist probability.
 */
export function rankClues(checked: CheckedClue[]): CheckedClue[] {
  return [...checked].sort(
    (a, b) =>
      Number(a.unsafe) - Number(b.unsafe) ||
      b.number - a.number ||
      gap(b) - gap(a) ||
      b.probability - a.probability
  );
}
