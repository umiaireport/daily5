# Nansen adapter module

## 1. Purpose and status

`client.ts` provides an isolated server transport for the optional Nansen integration. It remains disabled unless an explicit caller passes `enabled: true`; synthetic mode never calls it. Live Daily Five uses a one-time bounded candidate scan: historical TGM DEX trades with `include_smart_money_labels: ["Whale"]` identify one signal asset per pool, while general TGM DEX trades and OHLCV provide the round evidence for 25 fresh Ethereum assets. The unrelated Hunt discovery feed is disabled unless `NANSEN_LIVE_HUNT=true` is explicitly set.

The operation map follows [the project plan](../../../01-whale-arena.md). Authentication and schemas follow [Nansen authentication](https://docs.nansen.ai/getting-started/authentication), [OHLCV](https://docs.nansen.ai/api/token-god-mode/price-ohlcv), and [labeled DEX trades](https://docs.nansen.ai/api/token-god-mode/dex-trades). Credit figures are planning estimates; consult the [credit guide](https://docs.nansen.ai/getting-started/credits) before enabling collection.

## 2. Code sections and functions

- `NANSEN_OPERATIONS` (`client.ts:4-11`): six allowed POST operations, including Smart Money netflow, historical OHLCV, labeled DEX trades, estimated credits, and cache lifetimes.
- `ProviderError` (`client.ts:47`): controlled error codes and HTTP statuses, with no provider response text.
- `Usage`, `AttemptEvent`, `ClientOptions`: accounting and injection contracts.
- `stableJson` (`client.ts:95`): private deterministic request serialization used for request hashes and cache keys.
- `retryDelay` (`client.ts:105`): Retry-After seconds/date handling and fallback jitter.
- `createNansenClient` (`client.ts:120`): independent client state and disabled-by-default setup.
- Nested `acquire`/`release` (`client.ts:148`, `156`): two concurrent requests and 500ms request start spacing.
- Nested `request`/`task` (`client.ts:162`, `217`): schema validation, cache lookup, credit reservation, timeout, redacted attempt recording, HTTP classification, and at most two retries.
- Returned `usage` (`client.ts:300`): copied accounting counters for monitoring.

## 3. Caller contract

Pass request and response schemas exposing `parse(unknown)`; Zod schemas are compatible. Request bodies are JSON-normalized and hashed. Response schemas should preserve nullable segments, warnings, pagination, and truncation instead of coercing unknown values into zero.

The caller receives `{ data, cached }`. The cache returns independent copies and revalidates them against the caller's response schema. Attempts, HTTP successes, data-valid calls, cache hits, estimated/reserved credits, and actual known deductions have separate counters. Unknown charges remain reserved conservatively, including failed requests and timeouts.

Use `onAttempt` to receive redacted request hashes and accounting events. The callback is synchronous and must not throw. No payload body, API key, or provider error text is passed to it. `verifiedCreditHeader` is unset by default because no live per-request deduction header has been confirmed; the client never pretends an estimate is an actual deduction.

## 4. Live integration requirements

The current cache and credit ledger are process-local. Persist the ledger and request events, coordinate collectors across processes, verify endpoint request/response schemas and actual charges, obtain the user's budget and key, and confirm data display permissions before connecting this module to a live worker. A provider charge above its estimate can exceed the preflight amount; reconciliation prevents subsequent requests but cannot undo the charge.

Historical responses cached here expire after one day; the provider-backed Daily Five pack requests each configured token's real OHLCV and labeled DEX trades once, then slices five completed cutoffs locally without archiving raw provider payloads. `server/domain/live.ts` remains available for the explicitly opt-in Hunt discovery feed. `server/domain/hunt/live-board.ts` rotates selected assets into zones per match and round without exposing provider payloads.

## 5. Verification

From `whale-arena`, run `npm test` or `npx tsx --test tests/provider.test.ts`. Offline fixtures exercise request allowlisting, authentication placement, disabled mode, nulls and coverage warnings, immutable caching, expiry, 401/402/400/429/503 handling, retry ceilings, Retry-After dates, timeouts, concurrent budget reservation, and credit reconciliation. They do not prove a live Nansen contract.
