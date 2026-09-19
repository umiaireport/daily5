# Live scenario collector

## Purpose

`server/domain/live.ts` turns validated Nansen token-screener, Smart Money netflow, token-information, Flow Intelligence, and OHLCV responses into one attributable, current-data game scenario. It filters stablecoins and unusable liquidity, uses observed candles and volumes for replay charts when available, creates composite clues, and throws a controlled `LiveCollectionError` when three safe assets are not available.

## Functions

- `LiveCollectionError` — `server/domain/live.ts:72`: controlled collection failure.
- `asNumber` — `server/domain/live.ts:86`: normalizes provider numeric fields.
- `compact` — `server/domain/live.ts:92`: bounds user-facing token labels.
- `shortAddress` — `server/domain/live.ts:97`: creates a safe address fallback.
- `metricValue` — `server/domain/live.ts:101`: reads optional spot/flow metrics.
- `closeSeries` — `server/domain/live.ts:109`: extracts a bounded positive close-price series from OHLCV responses.
- `volumeSeries` — `server/domain/live.ts:123`: extracts OHLCV volumes and creates a deterministic fallback when volume is missing.
- `series` — `server/domain/live.ts:133`: creates deterministic replay chart points.
- `clue` — `server/domain/live.ts:142`: builds an observed, attributed clue.
- `stableSymbol` — `server/domain/live.ts:154`: excludes common stablecoins.
- `candidateScore` — `server/domain/live.ts:158`: ranks usable discovery rows.
- `normalizeCandidates` — `server/domain/live.ts:165`: filters, deduplicates, and selects three rows.
- `makeAsset` — `server/domain/live.ts:183`: maps one provider row plus optional Smart Money, info, flow, and candle responses.
- `collectLiveScenario` — `server/domain/live.ts:316`: performs the allowlisted live calls and returns a game scenario.
