# Daily Five synthetic observations

## 1. Purpose and behavior

Creates fictional prices and cohort trade records without reading outcomes. Five path families rotate between rounds and vary in amplitude/jitter, so all 25 normalized paths differ. Private summaries report buys/sells, unique participants, concentration, net token accumulation, timing/volume, volatility and price response. Interpretations describe uncertainty. No generated trade or wallet record enters public descriptors.

## 2. Code sections

Six-hour records; six aggregate clue projections. Counts and sums use the same records.

## 3. Functions and checks

- `syntheticObservations` — `server/domain/daily-five/observations.ts:18`.
- `observationClue` — `server/domain/daily-five/observations.ts:58`.
- `buys` — `server/domain/daily-five/observations.ts:63`.
- `sells` — `server/domain/daily-five/observations.ts:64`.
- `sum` — `server/domain/daily-five/observations.ts:65`.
- `money` — `server/domain/daily-five/observations.ts:70`.
- `prices` — `server/domain/daily-five/observations.ts:71`.
- `lastHour` — `server/domain/daily-five/observations.ts:74`.
- `earlier` — `server/domain/daily-five/observations.ts:75`.
