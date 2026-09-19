# `tests/provider.test.ts`

This module tests the isolated Nansen adapter using injected fetch/sleep/clock functions: disabled/configuration modes, allowlisting and request schemas, cache copies/expiry, nulls and warnings, 401/402/400/429/503 classification, retry ceilings, Retry-After, timeout, concurrency/budget reservation, and credit reconciliation. The `fixture` helper is at `tests/provider.test.ts:36`; test callbacks occupy `tests/provider.test.ts:69-218`.
