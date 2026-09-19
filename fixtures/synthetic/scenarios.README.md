# Synthetic scenario fixtures

## Purpose and sections

`fixtures/synthetic/scenarios.ts` creates five fictional rounds with aliases, hidden identities, clue cards, pre-decision series, outcome series, deterministic prices, and explanatory copy. It is the only game data source used by the current tutorial.

## Functions and data

- `makeSeries` — `fixtures/synthetic/scenarios.ts:65`: creates a deterministic 12-point display series.
- `clue` — `fixtures/synthetic/scenarios.ts:103`: nested factory for typed clue cards.
- `SCENARIOS` — `fixtures/synthetic/scenarios.ts:77`: maps the five stories to synthetic scenario records.
