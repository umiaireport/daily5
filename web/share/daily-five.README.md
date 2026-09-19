# Daily Five sharing

## 1. Purpose

`web/share/daily-five.ts` projects a saved `DailyFinalResult` into a redacted text share, a local PNG scorecard, clipboard output, or the browser share sheet. It uses ticket symbols, raw final equity, return, directional accuracy, and the exact cohort label available to the caller. It never adds token names, directions, clues, seeds, or answer mappings.

## 2. Functions

- `displayNumber` — `web/share/daily-five.ts:9`: normalizes a daily number for share output.
- `isNegative` — `web/share/daily-five.ts:14`: checks the saved ticket return sign.
- `displayMoney` — `web/share/daily-five.ts:18`: formats fixed-point equity with separators while preserving non-zero cents.
- `dailyOutcomeSymbol` — `web/share/daily-five.ts:25`: maps a saved ticket to win, loss, liquidation, or cash symbols.
- `dailyDirectionAccuracy` — `web/share/daily-five.ts:31`: counts profitable non-liquidated directional tickets.
- `buildDailyFiveShareText` — `web/share/daily-five.ts:43`: builds the redacted text projection and practice label.
- `drawText` — `web/share/daily-five.ts:58`: draws one scorecard text line on a local canvas.
- `createDailyFiveScorecardBlob` — `web/share/daily-five.ts:73`: creates a 1200×630 PNG blob without uploading it.
- `downloadDailyFiveScorecard` — `web/share/daily-five.ts:135`: saves and revokes the local PNG URL.
- `copyDailyFiveShareText` — `web/share/daily-five.ts:147`: copies text when clipboard access is available.
- `shareDailyFiveNative` — `web/share/daily-five.ts:155`: uses the native share sheet when supported.
