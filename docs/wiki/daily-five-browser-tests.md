# Daily Five browser journeys

## 1. Purpose and behavior

Uses actual application services on desktop and mobile. Covers whole-card corner clicks and keyboard activation, clue selection/credits, percentage and dollar allocation entry, linked leverage slider and numeric input, reload, all five rounds, shares, transient resume, practice recovery, lost replies, continuation errors, countdown and 320px layout. Failures are injected only for recovery tests.

## 2. Code sections

Run Node 24: node node_modules/@playwright/test/cli.js test tests/browser/daily-five.spec.ts. Screenshots: docs/screenshots/daily-five-*.png.

## 3. Functions and checks

- `Daily Five cards, measured clues, validation, reload and all five saved rounds` — `tests/browser/daily-five.spec.ts:5`.
- `Daily Five retries transient resume failures without starting another attempt` — `tests/browser/daily-five.spec.ts:134`.
- `Daily Five missing attempt offers explicit practice recovery` — `tests/browser/daily-five.spec.ts:156`.
- `Daily Five restores a lost saved response and reconnects a failed continuation` — `tests/browser/daily-five.spec.ts:178`.
- `Daily Five hung action has a countdown and stops at its deadline` — `tests/browser/daily-five.spec.ts:205`.
- `Daily Five fits 320px and preserves visible keyboard selection` — `tests/browser/daily-five.spec.ts:228`.
