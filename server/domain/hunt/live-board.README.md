# Live Hunt board factory

## 1. Purpose

`server/domain/hunt/live-board.ts` adapts the validated live scenario into public Hunt windows. It preserves provider price and volume observations, attaches bounded market and Smart Money context, and deterministically rotates the three selected assets for each match and round.

## 2. Functions

- `hash` — `server/domain/hunt/live-board.ts:5`: derives a stable rotation seed without random state.
- `fallbackVolumes` — `server/domain/hunt/live-board.ts:14`: supplies chart volumes when a live candle response has no usable volume.
- `pulseIndices` — `server/domain/hunt/live-board.ts:24`: identifies the largest observed volume points for public chart markers.
- `windowFor` — `server/domain/hunt/live-board.ts:33`: maps one scenario asset to a Hunt window and market context.
- `createLiveHuntBoardFactory` — `server/domain/hunt/live-board.ts:56`: returns a match and round keyed asset assignment.
