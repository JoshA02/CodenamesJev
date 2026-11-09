# Codenames x Jev

A small, solo take on the word game Codenames, built to explore [TypeSafe AI](https://typesafe.ai)'s Jev model. You're the red spymaster; Jev is your guesser.

> Unofficial fan project. Not affiliated with Czech Games Edition, publisher of Codenames.

## How it plays

- You see a 5x5 board with every card's team (9 red, 8 blue, 7 neutral, 1 assassin).
- Give a one-word clue and a number. Jev **scores** how well the clue fits every word, then **chooses** its guesses one at a time.
- After your turn, blue uncovers one of its own words. Find all red words first; hit the assassin and you lose.
- Stuck? **Suggest** asks Jev to pick a clue for you and explains why.

### How Jev is used

| Feature | Jev questions | What code does |
|---|---|---|
| Rate a clue | One `score` question per board word (0–4 rubric), all in one request | Shows a fit bar on each card |
| Guess | A `choice` question over the remaining words | Reveals the pick, stops on a wrong guess |
| Suggest a clue | `choice` questions shortlist ~1,500 candidate clues (max 255 options per question), then `score` checks on the finalists | Counts red words that clearly beat every risky word, and rejects clues that point at the assassin |

## System One models

Jev is what TypeSafe calls a **System One model**: a model built to make fast, structured decisions that software can use directly.[^concepts] The name comes from the fast, intuitive "System 1" in Daniel Kahneman's *Thinking, Fast and Slow*.[^concepts]

**How it differs from an LLM.** An LLM generates text one token at a time, and you parse its reply. Jev takes a state and a set of typed questions, and answers them all in parallel in a single query, with structured values: a choice from a list, a score on a rubric, or a yes/no probability. Choice and score answers include a probability for every option.[^launch] It doesn't write replies, code or explanations.[^concepts]

**Why that's useful:**

- **No parsing or malformed output.** Answers come back as typed values, and the TypeScript SDK infers their types from the questions.
- **Probabilities, not just answers.** The guesser's full ranking is shown on screen, and the clue suggester uses probabilities to build its shortlist.
- **Speed.** TypeSafe reports 70–500 ms end to end, against seconds for frontier LLMs on the same kind of task.[^launch] In this project, a 30-option `choice` question reported about 50 ms of evaluation time.
- **Cost.** $0.042 per million input tokens, with output tokens free.[^models] That 30-option question used 760 input tokens: about $0.00003.

### What I learned building this

Many things I'd have gone straight to an LLM for are really decisions: rate this, pick one of these, is this true? Here, Jev rates clues, picks guesses, and shortlists clues from a 1,500-word bank, all without generating a sentence. Framing those as typed questions made them faster, cheaper and easier to wire into code.

It isn't a drop-in replacement. A single `choice` question didn't reliably avoid risky clues on its own (it shortlisted AGE on a board where TIME was the assassin), so the final call combines Jev's scores with plain code rules. And anything that needs written output, such as an explanation of a clue, still needs an LLM.

## Running it

Requires Node.js 22 or newer and a TypeSafe API key.

```bash
npm install
cp .env.example .env   # then replace TYPESAFE_KEY with your key
npm run dev
```

> **The key is sent to the browser.** This is a local demo: `VITE_TYPESAFE_API_KEY` is bundled into the page, so anyone who can open it can read the key. Don't deploy it publicly with a real key.

The TypeSafe API doesn't allow direct browser calls (CORS), so the Vite dev and preview servers proxy `/typesafe/*` to `api.typesafe.ai`. A static host would need the same rewrite.

## Testing clues in the TypeSafe playground

`scripts/clue-test.ts` writes the same requests the game sends, for pasting into TypeSafe's playground:

```bash
node scripts/clue-test.ts new-board      # deal a board and build the round 1 shortlist
node scripts/clue-test.ts round2         # after saving playground/round1-response.json
node scripts/clue-test.ts check ANIMAL   # score request for one clue
node scripts/clue-test.ts number ANIMAL  # after saving playground/check-ANIMAL-response.json
```

Files go in `playground/`, which is git-ignored.

## Project layout

| File | Purpose |
|---|---|
| `src/jev.ts` | All Jev calls: rating a clue, guessing, suggesting a clue |
| `src/spymaster.ts` | Clue candidates, shortlist splitting, and the rule that turns scores into a safe clue number |
| `src/game.ts` | Board, rules and clue validation |
| `src/rubric.ts` | The 0–4 fit rubric and question wording |
| `src/clueBank.ts`, `src/words.ts` | Candidate clues and board words |
| `src/App.tsx` | The game UI |

[^concepts]: TypeSafe docs, [System One models](https://docs.typesafe.ai/concepts/system-one.md).
[^launch]: TypeSafe, [Introducing System One models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (15 Sep 2026). Speed figures are TypeSafe's own benchmarks, which it says are likely "on the higher end of real world gains".
[^models]: TypeSafe docs, [Models and pricing](https://docs.typesafe.ai/models.md), for Jev 1.13 and 1.14.
