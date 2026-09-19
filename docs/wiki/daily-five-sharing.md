# Daily Five sharing

## 1. Saved-result projection

`buildDailyFiveShareText` (`web/share/daily-five.ts:43`) creates the text projection from the saved final result. `dailyOutcomeSymbol` (`:25`) maps each saved ticket to a green, red, liquidation, or cash symbol. `dailyDirectionAccuracy` (`:31`) counts only non-liquidated trade tickets. `displayNumber` (`:9`) normalizes values such as `17` to `017`, and `displayMoney` (`:18`) adds separators while preserving non-zero cents.

The output contains the Daily Five number, outcome symbols, final equity, return, directional accuracy, and the fixed cohort wording. Practice output adds an explicit exact-case practice label. It excludes token names, directions, clues, seeds, and answer mappings.

## 2. Browser outputs

`createDailyFiveScorecardBlob` (`web/share/daily-five.ts:73`) draws a local 1200×630 PNG. `downloadDailyFiveScorecard` (`:135`) triggers the local download and revokes its object URL. `copyDailyFiveShareText` (`:147`) uses the clipboard when available, and `shareDailyFiveNative` (`:155`) uses the browser share sheet when available. None of these functions upload the saved result.
