# Nansen adapter

## Purpose and sections

`server/nansen/client.ts` is an isolated, disabled-by-default transport boundary for future verified provider calls. It allowlists endpoint paths, validates caller schemas, hashes normalized requests, caches responses in process memory, reserves estimated credits, limits concurrency/rate, retries transient errors, and emits redacted attempts.

## Functions and methods

- `ProviderError` — `server/nansen/client.ts:48`: controlled provider error without response-body leakage.
- `stableJson` — `server/nansen/client.ts:96`: deterministic request serialization.
- `retryDelay` — `server/nansen/client.ts:106`: parses `Retry-After` or computes jittered backoff.
- `createNansenClient` — `server/nansen/client.ts:121`: creates isolated client state and returns `request`/`usage`.
- nested `acquire` — `server/nansen/client.ts:149`; nested `release` — `server/nansen/client.ts:157`.
- nested `request` — `server/nansen/client.ts:163`: validation, cache, budget, fetch/retry loop.
- nested `task` — `server/nansen/client.ts:218`: one timeout-aware HTTP call and response validation.
- returned `usage` — `server/nansen/client.ts:301`: returns a copy of counters.

The current live smoke test verifies the token-screener and token-information paths and the `x-nansen-credits-cost` reconciliation header. No durable provider ledger is claimed here.
