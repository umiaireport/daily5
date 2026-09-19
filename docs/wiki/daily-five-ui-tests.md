# Daily Five UI and transport tests

## 1. Purpose and behavior

Checks saved reveals, safe shares, SSR loading, routes/keys/errors, hung headers/body timeout, and explicit missing-round recovery.

## 2. Code sections

Run Node 24: node --import tsx --test tests/daily-five-ui.spec.ts.

## 3. Functions and checks

- `transportStub` — `tests/daily-five-ui.spec.ts:61`.
- `Daily Five views render saved reveals and a safe final share projection` — `tests/daily-five-ui.spec.ts:72`.
- `Daily Five screen begins with an accessible loading state before transport effects run` — `tests/daily-five-ui.spec.ts:109`.
- `Daily Five transport uses current routes, command bodies, generated fallback keys, and API errors` — `tests/daily-five-ui.spec.ts:118`.
- `saved result typing remains compatible with the current Daily Five contract` — `tests/daily-five-ui.spec.ts:208`.
- `Daily Five requests bound hung transports and body streams and retain error detail` — `tests/daily-five-ui.spec.ts:214`.
- `missing rounds are recoverable errors while final results need no open round` — `tests/daily-five-ui.spec.ts:243`.
