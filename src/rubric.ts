// How Jev rates a clue against a board word. Shared by the game (jev.ts) and the
// playground script, so both send exactly the same wording.

/** How strongly the clue points at a word, from 0 (unrelated) to 4. */
export const RUBRIC = [
  'Unrelated: nobody would connect the clue to this word.',
  'Weak: a stretch; only a loose or obscure link.',
  'Moderate: a reasonable link that some players would see.',
  'Strong: an obvious association most players would make.',
  'Direct: the clue practically names or defines this word.',
] as const;

export const RUBRIC_LABELS = ['Unrelated', 'Weak', 'Moderate', 'Strong', 'Direct'] as const;

export interface Rating {
  /** Expected score on the 0-4 rubric; may fall between levels. */
  score: number;
  confidence: number;
}

export const fitState = (clue: string) =>
  `In the word game Codenames, a spymaster gave the one-word clue "${clue}" to hint at some words on the board.`;

export const fitInstructions = (clue: string, word: string) =>
  `How strongly does the clue "${clue}" point to the board word "${word}"?`;
