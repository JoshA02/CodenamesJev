// Solo Codenames: you are the red spymaster and Jev is your guesser.
// Each turn you give a one-word clue and a number; Jev guesses up to that many
// words. After your turn the rival (blue) team uncovers one of its own words.

import { WORDS } from './words.ts';

export type Team = 'red' | 'blue' | 'neutral' | 'assassin';

export interface Card {
  word: string;
  team: Team;
  revealed: boolean;
}

export type Outcome = 'playing' | 'won' | 'lost';

export const BOARD_SIZE = 25;
const COUNTS: Record<Team, number> = { red: 9, blue: 8, neutral: 7, assassin: 1 };

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newBoard(): Card[] {
  const words = shuffle(WORDS).slice(0, BOARD_SIZE);
  const teams = shuffle(
    (Object.entries(COUNTS) as [Team, number][]).flatMap(([team, n]) => Array<Team>(n).fill(team))
  );
  return words.map((word, i) => ({ word, team: teams[i], revealed: false }));
}

export function remaining(board: Card[], team: Team): number {
  return board.filter((c) => c.team === team && !c.revealed).length;
}

export function outcome(board: Card[]): Outcome {
  if (board.some((c) => c.team === 'assassin' && c.revealed)) return 'lost';
  if (remaining(board, 'red') === 0) return 'won';
  if (remaining(board, 'blue') === 0) return 'lost';
  return 'playing';
}

export function reveal(board: Card[], word: string): Card[] {
  return board.map((c) => (c.word === word ? { ...c, revealed: true } : c));
}

/** The rival team uncovers one of its own words at random. */
export function rivalTurn(board: Card[]): { board: Card[]; word: string | null } {
  const hidden = board.filter((c) => c.team === 'blue' && !c.revealed);
  if (hidden.length === 0) return { board, word: null };
  const pick = hidden[Math.floor(Math.random() * hidden.length)].word;
  return { board: reveal(board, pick), word: pick };
}

/** Returns an error message, or null when the clue is legal. */
export function validateClue(clue: string, board: Card[]): string | null {
  const c = clue.trim().toUpperCase();
  if (!c) return 'Enter a clue.';
  if (!/^[A-Z]+$/.test(c)) return 'Clues must be a single word, letters only.';
  const clash = board.find((card) => !card.revealed && (card.word.includes(c) || c.includes(card.word)));
  if (clash) return `"${c}" is too close to ${clash.word}, a word on the board.`;
  return null;
}
