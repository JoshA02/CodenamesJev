import { useState, type CSSProperties, type FormEvent } from 'react';
import { newBoard, outcome, remaining, reveal, rivalTurn, validateClue, type Card, type Team } from './game.ts';
import { hasApiKey, pickGuess, rateClue, suggestClue, type Guess, type Suggestion } from './jev.ts';
import { RUBRIC_LABELS, type Rating } from './rubric.ts';
import { gap, type CheckedClue } from './spymaster.ts';

type Phase = 'clue' | 'suggesting' | 'scoring' | 'guessing' | 'rival';

/** Why a checked clue got the number it did, in a few words. */
function verdict(c: CheckedClue): string {
  if (c.unsafe) return 'points at the assassin';
  if (c.number === 0) return c.risk ? `no red word beats ${c.risk.word} safely` : 'no red word fits well';
  return c.targets.map((t) => t.word).join(', ');
}

interface TurnLog {
  clue: string;
  number: number;
  guesses: { word: string; team: Team; confidence: number }[];
  rival: string | null;
}

const TEAM_NAME: Record<Team, string> = { red: 'Red', blue: 'Blue', neutral: 'Neutral', assassin: 'Assassin' };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  // A new random board is dealt on every page load.
  const [board, setBoard] = useState<Card[]>(newBoard);
  const [phase, setPhase] = useState<Phase>('clue');
  const [clue, setClue] = useState('');
  const [number, setNumber] = useState(2);
  const [ratings, setRatings] = useState<Record<string, Rating> | null>(null);
  const [lastGuess, setLastGuess] = useState<Guess | null>(null);
  const [thinking, setThinking] = useState<string | null>(null);
  const [log, setLog] = useState<TurnLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  const result = outcome(board);
  const busy = phase !== 'clue';
  const clueError = clue ? validateClue(clue, board) : null;

  function updateLog(fn: (turn: TurnLog) => TurnLog) {
    setLog((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);
  }

  async function suggest() {
    if (busy || result !== 'playing') return;
    setError(null);
    setSuggestion(null);
    setPhase('suggesting');
    try {
      const s = await suggestClue(board, { exclude: log.map((t) => t.clue), onProgress: setThinking });
      setSuggestion(s);
      if (s.best) {
        setClue(s.best.clue);
        setNumber(s.best.number);
      }
    } catch (err) {
      setError(`Jev request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setThinking(null);
      setPhase('clue');
    }
  }

  async function playTurn(e: FormEvent) {
    e.preventDefault();
    const problem = validateClue(clue, board);
    if (problem || busy || result !== 'playing') return setError(problem);
    const word = clue.trim().toUpperCase();
    setError(null);
    setLastGuess(null);
    setRatings(null);
    setSuggestion(null);

    let b = board;
    const hidden = () => b.filter((c) => !c.revealed).map((c) => c.word);
    try {
      setPhase('scoring');
      setThinking('Jev is rating every word against your clue…');
      const scores = await rateClue(word, hidden());
      setRatings(scores);
      setLog((prev) => [...prev, { clue: word, number, guesses: [], rival: null }]);

      setPhase('guessing');
      const guessed: string[] = [];
      for (let i = 0; i < number; i++) {
        setThinking(`Jev is choosing guess ${i + 1} of ${number}…`);
        const guess = await pickGuess({ clue: word, number, candidates: hidden(), ratings: scores, guessedThisTurn: guessed });
        setLastGuess(guess);
        await pause(500);
        b = reveal(b, guess.word);
        setBoard(b);
        guessed.push(guess.word);
        const team = b.find((c) => c.word === guess.word)!.team;
        updateLog((t) => ({ ...t, guesses: [...t.guesses, { word: guess.word, team, confidence: guess.confidence }] }));
        if (team !== 'red' || outcome(b) !== 'playing') break;
      }

      if (outcome(b) === 'playing') {
        setPhase('rival');
        setThinking('Blue team is taking its turn…');
        await pause(700);
        const rival = rivalTurn(b);
        b = rival.board;
        setBoard(b);
        updateLog((t) => ({ ...t, rival: rival.word }));
      }
      setClue('');
    } catch (err) {
      setError(`Jev request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setThinking(null);
      setPhase('clue');
    }
  }

  function restart() {
    setBoard(newBoard());
    setRatings(null);
    setLastGuess(null);
    setLog([]);
    setError(null);
    setClue('');
    setSuggestion(null);
  }

  const topChoices = lastGuess
    ? Object.entries(lastGuess.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 5)
    : [];

  return (
    <main>
      <header>
        <h1>Codenames × Jev</h1>
        <p className="hint">
          You're the <b className="t-red">red</b> spymaster. Give a one-word clue and a number. Jev rates how
          well your clue fits every word, then picks its guesses. Stuck? Ask Jev to suggest a clue.
        </p>
        <div className="scores">
          <span className="pill red">Red left: {remaining(board, 'red')}</span>
          <span className="pill blue">Blue left: {remaining(board, 'blue')}</span>
        </div>
      </header>

      {!hasApiKey && (
        <p className="banner">
          Add your TypeSafe API key to <code>.env</code> (replace <code>TYPESAFE_KEY</code>) and restart the dev
          server to let Jev play.
        </p>
      )}

      <div className="board">
        {board.map((card) => {
          const rating = ratings?.[card.word];
          const isLatest = lastGuess?.word === card.word;
          return (
            <div
              key={card.word}
              className={`card ${card.team} ${card.revealed ? 'revealed' : ''} ${isLatest ? 'latest' : ''}`}
              title={`${TEAM_NAME[card.team]}${rating ? ` · fit ${rating.score.toFixed(2)}/4` : ''}`}
            >
              <span className="word" style={{ '--len': card.word.length } as CSSProperties}>
                {card.word}
              </span>
              {rating && !card.revealed && (
                <span className="fit">
                  <span className="fit-bar" style={{ width: `${(rating.score / 4) * 100}%` }} />
                  <span className="fit-label">{RUBRIC_LABELS[Math.round(rating.score)]}</span>
                </span>
              )}
              {card.revealed && <span className="team-tag">{TEAM_NAME[card.team]}</span>}
            </div>
          );
        })}
      </div>

      {result === 'playing' ? (
        <form className="clue-form" onSubmit={playTurn}>
          <input
            aria-label="Clue"
            placeholder="One-word clue"
            value={clue}
            onChange={(e) => setClue(e.target.value.replace(/\s/g, ''))}
            disabled={busy}
            autoFocus
          />
          <select aria-label="Number of words" value={number} onChange={(e) => setNumber(Number(e.target.value))} disabled={busy}>
            {Array.from({ length: Math.min(9, remaining(board, 'red')) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button type="button" onClick={suggest} disabled={busy || !hasApiKey}>
            Suggest
          </button>
          <button type="submit" disabled={busy || !clue || !!clueError || !hasApiKey}>
            Give clue
          </button>
        </form>
      ) : (
        <div className={`result ${result}`}>
          <p>{result === 'won' ? 'You win! Jev found all your words.' : board.some((c) => c.team === 'assassin' && c.revealed) ? 'Jev hit the assassin. You lose.' : 'Blue found all their words first. You lose.'}</p>
          <button onClick={restart}>New game</button>
        </div>
      )}

      {(clueError || error) && <p className="error">{error ?? clueError}</p>}
      {thinking && <p className="thinking">{thinking}</p>}

      {suggestion && (
        <section className="panel">
          <h2>Jev's suggestion</h2>
          {suggestion.best ? (
            <p>
              <b>{suggestion.best.clue}</b> for <b>{suggestion.best.number}</b>, pointing to {verdict(suggestion.best)}.
              {suggestion.best.risk && (
                <>
                  {' '}The riskiest word is {suggestion.best.risk.word} ({TEAM_NAME[suggestion.best.risk.team].toLowerCase()},
                  fit {suggestion.best.risk.score.toFixed(2)}), and every counted word beats it by at least{' '}
                  {gap(suggestion.best).toFixed(2)}.
                </>
              )}
            </p>
          ) : (
            <p>Jev couldn't find a safe clue among the ones it checked. Try one of your own.</p>
          )}
          <p className="muted">
            Shortlisted from {suggestion.candidateCount.toLocaleString()} clues, then scored the top{' '}
            {suggestion.checked.length} against every word:
          </p>
          <ul className="checked">
            {suggestion.checked.map((c) => (
              <li key={c.clue} className={c.unsafe ? 'unsafe' : ''}>
                <span className="clue-word">{c.clue}</span>
                <span className="num">{c.unsafe ? '✕' : c.number}</span>
                <span>{verdict(c)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lastGuess && (
        <section className="panel">
          <h2>Jev's last choice</h2>
          <p>
            Picked <b>{lastGuess.word}</b> with {(lastGuess.confidence * 100).toFixed(0)}% confidence.
          </p>
          <ul className="probs">
            {topChoices.map(([w, p]) => (
              <li key={w}>
                <span>{w}</span>
                <span className="prob-bar"><span style={{ width: `${p * 100}%` }} /></span>
                <span className="num">{(p * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {log.length > 0 && (
        <section className="panel">
          <h2>Turns</h2>
          <ol className="log">
            {log.map((t, i) => (
              <li key={i}>
                <b>{t.clue}</b> for {t.number}:{' '}
                {t.guesses.length === 0
                  ? '…'
                  : t.guesses.map((g) => (
                      <span key={g.word} className={`t-${g.team}`}>
                        {g.word} ({(g.confidence * 100).toFixed(0)}%){' '}
                      </span>
                    ))}
                {t.rival && <span className="muted">· Blue uncovered {t.rival}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer>
        <button className="link" onClick={restart} disabled={busy}>New board</button>
      </footer>
    </main>
  );
}
