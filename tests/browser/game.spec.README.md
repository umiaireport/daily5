# Browser journey tests

`tests/browser/game.spec.ts` covers synthetic desktop/mobile journeys, private-file denial, clue budget, keyboard controls, scorecard download, leaderboard, unavailable daily mode, simulated-503 recovery, and saved-result recovery after a lost choice response. Five test callbacks span `tests/browser/game.spec.ts:5-163`; they produce 10 tests per development/production mode. Development and production runs pass. See [`../../docs/wiki/browser-tests.md`](../../docs/wiki/browser-tests.md).
