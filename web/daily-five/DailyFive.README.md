# Daily Five screen

## 1. Purpose and behavior

A–E are whole native buttons with keyboard activation and explicit selection. Each card includes a visible compact snapshot of the same `PriceChart` used by the selected research view. The research column combines a shared-scale chart and six optional evidence cards; the allocation panel sits alongside on desktop and below on mobile. The v2 wallet starts at $10,000 and carries each settled balance into the next round. Amount and leverage use matched compact slider/input rows, with a fixed `$` prefix in the amount field. Portfolio reveals show a half-width outcome chart beside equal result and explanation cards per allocated asset, and mobile stacks the three cards. Nansen live mode publishes provider OHLCV and smart-money/flow clues; synthetic practice remains explicitly labeled. Answers arrive only after unlock; saved results and shares remain server projections. Focus moves to each new round/result heading. Reduced motion and 320px layout are supported.

## 2. Code sections

Safe shares and result views; journey composition; chart/evidence and ticket controls; display helpers.

## 3. Functions and checks

- `dailyNumberFromId` — `web/daily-five/DailyFive.tsx:65`.
- `displayQuestion` — `web/daily-five/DailyFive.tsx:70`.
- `defaultDraft` — `web/daily-five/DailyFive.tsx:74`.
- `moneyNumber` — `web/daily-five/DailyFive.tsx:83`.
- `ticketMoney` — `web/daily-five/DailyFive.tsx:88`.
- `calculateAccuracyLabel` — `web/daily-five/DailyFive.tsx:92`.
- `resultHeading` — `web/daily-five/DailyFive.tsx:99`.
- `decisionLabel` — `web/daily-five/DailyFive.tsx:107`.
- `revealAsset` — `web/daily-five/DailyFive.tsx:112`.
- `ShareActions` — `web/daily-five/DailyFive.tsx:122`.
- `copy` — `web/daily-five/DailyFive.tsx:131`.
- `download` — `web/daily-five/DailyFive.tsx:140`.
- `challenge` — `web/daily-five/DailyFive.tsx:149`.
- `DailyFiveReveal` — `web/daily-five/DailyFive.tsx:186`.
- `DailyFiveFinal` — `web/daily-five/DailyFive.tsx:313`.
- `DailyFiveScreen` — `web/daily-five/DailyFive.tsx:415`.
- `updateDraft` — `web/daily-five/DailyFive.tsx:486`.
- `unlock` — `web/daily-five/DailyFive.tsx:490`.
- `updated` — `web/daily-five/DailyFive.tsx:493`.
- `submit` — `web/daily-five/DailyFive.tsx:511`.
- `continueRound` — `web/daily-five/DailyFive.tsx:540`.
- `selectedClue` — `web/daily-five/DailyFive.tsx:662`.
- `DailyProgress` — `web/daily-five/DailyFive.tsx:967`.
- `evidenceWindow` — `web/daily-five/DailyFive.tsx:992`.
- `format` — `web/daily-five/DailyFive.tsx:993`.
- `ClueAnswer` — `web/daily-five/DailyFive.tsx:1005`.
