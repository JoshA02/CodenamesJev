// All calls to Jev (TypeSafe AI) live here.

import { choice, score, TypeSafeClient } from '@typesafe-ai/sdk';
import type { Card } from './game.ts';
import { fitInstructions, fitState, RUBRIC, type Rating } from './rubric.ts';
import {
  clueCandidates,
  clueNumber,
  FINALISTS_PER_GROUP,
  rankClues,
  spymasterState,
  SPYMASTER_INSTRUCTIONS,
  splitOptions,
  topOptions,
  type CheckedClue,
} from './spymaster.ts';

/** How many of the final round's top clues get a full score check against the board. */
const CLUES_TO_CHECK = 5;

const PLACEHOLDER = 'TYPESAFE_KEY';
const apiKey = import.meta.env.VITE_TYPESAFE_API_KEY?.trim() ?? '';

/** False until a real key replaces the placeholder in `.env`. */
export const hasApiKey = apiKey !== '' && apiKey !== PLACEHOLDER;

let client: TypeSafeClient | null = null;
function getClient(): TypeSafeClient {
  // Demo project: the key is deliberately shipped to the browser. Requests go through the
  // same-origin /typesafe proxy in vite.config.ts because the API doesn't allow CORS.
  client ??= new TypeSafeClient({
    apiKey,
    baseURL: `${window.location.origin}/typesafe`,
    dangerouslyAllowBrowser: true,
    compression: false,
  });
  return client;
}

export interface Guess {
  word: string;
  confidence: number;
  probabilities: Record<string, number>;
}

/** Scores every word against the clue in one request; Jev answers each in parallel. */
export async function rateClue(clue: string, words: string[]): Promise<Record<string, Rating>> {
  const questions = Object.fromEntries(words.map((word) => [word, score(fitInstructions(clue, word), RUBRIC)]));
  const { answers } = await getClient().systemOne({ state: fitState(clue), questions });
  return Object.fromEntries(
    words.map((word) => [word, { score: answers[word].score, confidence: answers[word].confidence }])
  );
}

/** Asks Jev which remaining word the clue is pointing to next. */
export async function pickGuess(args: {
  clue: string;
  number: number;
  candidates: string[];
  ratings: Record<string, Rating>;
  guessedThisTurn: string[];
}): Promise<Guess> {
  const { clue, number, candidates, ratings, guessedThisTurn } = args;
  const { answers } = await getClient().systemOne({
    state: {
      game: 'Codenames',
      clue,
      clueNumber: number,
      alreadyGuessedForThisClue: guessedThisTurn,
      clueRelatednessRatings: Object.fromEntries(
        candidates.map((w) => [w, `${ratings[w]?.score.toFixed(2) ?? 'unknown'} out of 4`])
      ),
    },
    questions: {
      guess: choice(
        `You are the guesser. Which remaining board word is the clue "${clue}" most likely pointing to?`,
        Object.fromEntries(candidates.map((w) => [w, null]))
      ),
    },
  });
  const { choice: word, confidence, probabilities } = answers.guess;
  return { word, confidence, probabilities: { ...probabilities } };
}

/** One choice question per group of options, all in one request; returns each group's probabilities. */
async function shortlist(state: ReturnType<typeof spymasterState>, groups: string[][]) {
  const questions = Object.fromEntries(
    groups.map((g, i) => [`group${i + 1}`, choice(SPYMASTER_INSTRUCTIONS, Object.fromEntries(g.map((w) => [w, null])))])
  );
  const { answers } = await getClient().systemOne({ state, questions });
  return groups.map((_, i) => ({ ...answers[`group${i + 1}`].probabilities }) as Record<string, number>);
}

export interface Suggestion {
  /** The clue to give, or null when no candidate fits any red word safely. */
  best: CheckedClue | null;
  /** Every clue that got a score check, best first. */
  checked: CheckedClue[];
  candidateCount: number;
}

/**
 * Picks a clue for the red spymaster:
 *   1. choice questions shortlist the whole clue bank (255 options per question);
 *   2. if that took several groups, a final choice question compares their top picks;
 *   3. the top few, plus each group's winner, are scored against every hidden word in parallel;
 *   4. clueNumber turns the scores into a safe number, and rankClues picks the winner.
 *
 * The final round tends to settle on one theme, so its top picks are often near-synonyms.
 * The group winners come from random slices of the bank, so they add variety.
 */
export async function suggestClue(
  board: Card[],
  opts: { exclude?: string[]; onProgress?: (message: string) => void } = {}
): Promise<Suggestion> {
  const progress = opts.onProgress ?? (() => {});
  const state = spymasterState(board);
  const candidates = clueCandidates(board, opts.exclude);
  const groups = splitOptions(candidates);

  progress(`Jev is shortlisting ${candidates.length.toLocaleString()} possible clues…`);
  const round1 = await shortlist(state, groups);

  let ranked = round1[0];
  if (groups.length > 1) {
    const finalists = round1.flatMap((probs) => topOptions(probs, FINALISTS_PER_GROUP).map(([w]) => w));
    progress(`Jev is comparing the ${finalists.length} best clues…`);
    [ranked] = await shortlist(state, [[...new Set(finalists)].sort()]);
  }

  const groupWinners = groups.length > 1 ? round1.map((probs) => topOptions(probs, 1)[0][0]) : [];
  const toCheck = [...new Set([...topOptions(ranked, CLUES_TO_CHECK).map(([w]) => w), ...groupWinners])];
  progress(`Checking ${toCheck.join(', ')} against every word on the board…`);
  const hidden = board.filter((c) => !c.revealed).map((c) => c.word);
  const checked = rankClues(
    await Promise.all(
      toCheck.map(async (clue) => ({
        clue,
        // Group winners are always final-round options, so this is on one scale.
        probability: ranked[clue] ?? 0,
        ...clueNumber(board, await rateClue(clue, hidden)),
      }))
    )
  );
  const best = checked[0] && !checked[0].unsafe && checked[0].number > 0 ? checked[0] : null;
  return { best, checked, candidateCount: candidates.length };
}
