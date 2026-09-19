# `tests/live.test.ts`

The first test (`tests/live.test.ts:26`) uses a fake client to prove stablecoin filtering, duplicate removal, Smart Money netflow and wallet enrichment, token-information/Flow Intelligence/OHLCV enrichment, candle-based prices and volumes, three public assets, shuffled live Hunt assignments, timestamps, and attribution. The second test (`tests/live.test.ts:130`) proves an insufficient provider response becomes the controlled `LiveCollectionError`. Both tests are offline and run through `npm test`.
