// Builds playground requests asking Jev to pick the best spymaster clue for a board.
//
// The board lives in playground/board.json (created with the original test board if missing).
//   node scripts/clue-test.ts new-board  -> moves the current playground files into
//                                           playground/archive/, deals a random board and
//                                           builds its round 1 request.
//
// A choice question allows at most 255 options, so this runs as a two-round tournament:
//   node scripts/clue-test.ts          -> playground/round1.json: the candidates split across
//                                         several choice questions in one request.
//   (paste Jev's round 1 response into playground/round1-response.json)
//   node scripts/clue-test.ts round2   -> playground/round2.json: one choice question over the
//                                         top picks from every round 1 group.
//
// Then, to work out the number for a clue:
//   node scripts/clue-test.ts check ANIMAL FARM  -> playground/check-ANIMAL.json, ...: the same
//                                                   score request the game sends for a clue.
//   (paste each response into playground/check-<CLUE>-response.json)
//   node scripts/clue-test.ts number ANIMAL      -> prints the number and why.
//
// Each request is written three ways: <name>.json (whole request), <name>-state.json and
// <name>-questions.json, for playgrounds that take state and questions separately.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { newBoard, type Card, type Team } from '../src/game.ts';
import { fitInstructions, fitState, RUBRIC, RUBRIC_LABELS, type Rating } from '../src/rubric.ts';
import {
  clueCandidates,
  clueNumber,
  FINALISTS_PER_GROUP,
  spymasterState,
  SPYMASTER_INSTRUCTIONS,
  splitOptions,
  topOptions,
} from '../src/spymaster.ts';

type Board = Record<Team, string[]>;

const BOARD_FILE = 'playground/board.json';
const TEAMS: Team[] = ['red', 'blue', 'neutral', 'assassin'];

/** The board the first experiments used; written to BOARD_FILE when there isn't one yet. */
const DEFAULT_BOARD: Board = {
  red: ['LOG', 'YARD', 'VAN', 'SUIT', 'FIRE', 'REVOLUTION', 'MOUSE', 'CALF', 'HAWK'],
  blue: ['PIANO', 'GERMANY', 'CHURCH', 'PIPE', 'COURT', 'MASS', 'MINE', 'ANGEL'],
  neutral: ['PILOT', 'PIRATE', 'MOUNT', 'SINK', 'SPINE', 'LEAD', 'WASHER'],
  assassin: ['TIME'],
};

function saveBoard(b: Board) {
  mkdirSync('playground', { recursive: true });
  writeFileSync(BOARD_FILE, JSON.stringify(b, null, 2) + '\n');
}

function loadBoard(): Board {
  if (!existsSync(BOARD_FILE)) saveBoard(DEFAULT_BOARD);
  return JSON.parse(readFileSync(BOARD_FILE, 'utf8'));
}

let cards: Card[];
let state: ReturnType<typeof spymasterState>;

function useBoard(b: Board) {
  cards = TEAMS.flatMap((team) => b[team].map((word) => ({ word, team, revealed: false })));
  state = spymasterState(cards);
}

const clueQuestion = (options: string[]) => ({
  type: 'choice',
  instructions: SPYMASTER_INSTRUCTIONS,
  criteria: Object.fromEntries(options.map((w) => [w, null])),
});

function save(name: string, questions: Record<string, unknown>, requestState: unknown = state) {
  mkdirSync('playground', { recursive: true });
  const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  writeFileSync(`playground/${name}.json`, json({ state: requestState, questions }));
  writeFileSync(`playground/${name}-state.json`, json(requestState));
  writeFileSync(`playground/${name}-questions.json`, json(questions));
  const chars = JSON.stringify({ state: requestState, questions }).length;
  console.log(`playground/${name}.json: ~${chars.toLocaleString()} chars (~${Math.round(chars / 4).toLocaleString()} tokens)`);
}

const readAnswers = <T>(file: string): Record<string, T> => {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  // Accept the full API response ({ answers: {...} }) or just its answers object.
  return raw.answers ?? raw;
};

function round1() {
  const candidates = clueCandidates(cards);
  const groups = splitOptions(candidates);
  save('round1', Object.fromEntries(groups.map((g, i) => [`group${i + 1}`, clueQuestion(g)])));
  console.log(`${candidates.length} candidates in ${groups.length} groups of ${groups.map((g) => g.length).join(', ')}`);
}

type ChoiceAnswer = { choice: string; probabilities: Record<string, number> };

function round2() {
  const answers = readAnswers<ChoiceAnswer>('playground/round1-response.json');
  const finalists = Object.entries(answers).flatMap(([group, answer]) => {
    const top = topOptions(answer.probabilities, FINALISTS_PER_GROUP);
    console.log(`${group}: ${top.map(([w, p]) => `${w} ${(p * 100).toFixed(1)}%`).join(', ')}`);
    return top.map(([w]) => w);
  });
  save('round2', { clue: clueQuestion([...new Set(finalists)].sort()) });
  console.log(`${finalists.length} finalists`);
}

/** The exact score request the game's rateClue sends: one question per board word. */
function check(clues: string[]) {
  for (const clue of clues.map((c) => c.toUpperCase())) {
    const questions = Object.fromEntries(
      cards.map((c) => [c.word, { type: 'score', instructions: fitInstructions(clue, c.word), criteria: RUBRIC }])
    );
    save(`check-${clue}`, questions, fitState(clue));
  }
}

function number(clue: string) {
  clue = clue.toUpperCase();
  const answers = readAnswers<Rating>(`playground/check-${clue}-response.json`);
  const ratings = Object.fromEntries(
    cards.map((c) => [c.word, { score: answers[c.word].score, confidence: answers[c.word].confidence }])
  );
  const result = clueNumber(cards, ratings);
  const rows = [...cards].sort((a, b) => ratings[b.word].score - ratings[a.word].score);
  for (const c of rows) {
    const s = ratings[c.word].score;
    const counted = result.targets.some((t) => t.word === c.word) ? '  <- counts' : '';
    console.log(`${c.word.padEnd(11)} ${c.team.padEnd(8)} ${s.toFixed(2)}  ${RUBRIC_LABELS[Math.round(s)].padEnd(9)}${counted}`);
  }
  console.log('');
  if (result.risk) console.log(`Riskiest non-red word: ${result.risk.word} (${result.risk.team}) at ${result.risk.score.toFixed(2)}`);
  console.log(`A red word must score at least ${result.threshold.toFixed(2)}.`);
  console.log(
    result.unsafe
      ? `${clue}: unsafe, it points at the assassin.`
      : `${clue} ${result.number}${result.number ? ` -> ${result.targets.map((t) => t.word).join(', ')}` : ' (no red word fits safely)'}`
  );
}

/** Archives the current board's files (requests and pasted responses), then deals a new board. */
function newBoardCommand() {
  const previous = loadBoard();
  const files = readdirSync('playground').filter((f) => f.endsWith('.json'));
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const dir = `playground/archive/${stamp}_${previous.red[0]}`;
  mkdirSync(dir, { recursive: true });
  for (const f of files) renameSync(`playground/${f}`, `${dir}/${f}`);
  console.log(`Moved ${files.length} files to ${dir}/`);

  const dealt = newBoard();
  const next = Object.fromEntries(
    TEAMS.map((team) => [team, dealt.filter((c) => c.team === team).map((c) => c.word)])
  ) as Board;
  saveBoard(next);
  useBoard(next);
  for (const team of TEAMS) console.log(`${team.padEnd(9)}${next[team].join(', ')}`);
  round1();
}

const [mode, ...args] = process.argv.slice(2);
useBoard(loadBoard());
if (mode === 'new-board') newBoardCommand();
else if (mode === 'round2') round2();
else if (mode === 'check') check(args);
else if (mode === 'number') number(args[0]);
else round1();
