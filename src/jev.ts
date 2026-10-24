// All calls to Jev (TypeSafe AI) live here.

import { choice, score, TypeSafeClient } from '@typesafe-ai/sdk';
import { fitInstructions, fitState, RUBRIC, type Rating } from './rubric.ts';

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
