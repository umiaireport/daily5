# Daily challenge component

## Purpose

`DailyChallenge.tsx` renders the provider-backed daily evidence snapshot, immutable allocation entry, settlement status, and evidence detail modals. It intentionally never displays settlement prices before the server publishes an official result.

## Functions

- `DailyChallenge` — `web/components/DailyChallenge.tsx:58`: renders daily evidence, allocation controls, entry state, and settlement feedback.

## Types

- `DailyAsset` — `web/components/DailyChallenge.tsx:6`: public asset evidence contract.
- `DailyChallengePayload` — `web/components/DailyChallenge.tsx:14`: public challenge contract.
- `DailySummary` — `web/components/DailyChallenge.tsx:35`: lifecycle summary returned by the API.
- `DailyEntryResult` — `web/components/DailyChallenge.tsx:48`: pending, settled, or void entry result.
