# Daily Five screen entrypoint

## 1. Purpose

`web/daily-five/index.ts` is the narrow browser export for the Daily Five screen. It re-exports `DailyFiveScreen` and its prop type so the coordinator can mount the feature without importing implementation helpers.

## 2. Exports

- `DailyFiveScreen` — `web/daily-five/index.ts:1`: public screen export.
- `DailyFiveScreenProps` — `web/daily-five/index.ts:2`: transport, display-number, leaderboard, and friend-share prop type.
