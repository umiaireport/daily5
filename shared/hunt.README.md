# Shared Hunt contract

## 1. Purpose

`shared/hunt.ts` defines the browser/server Hunt commands, role-filtered match views, replay response, and reveal payload.

## 2. Relevant types

- `HuntTracerView` (`hunt.ts:76`) carries public assets, scoped evidence, scan credits, pins, and private suspicion.
- `HuntWhaleView` (`hunt.ts:89`) carries only the whale’s private target and purchase state.
- `HuntAssetIdentity` (`hunt.ts:192`) contains symbol/name metadata released after resolution.
- `HuntReveal` (`hunt.ts:182`) carries final result data and optional resolved identities.

The contract keeps the existing two-location scorer compatible while the UI presents a single lead suspect for each round. Public views continue to omit identity metadata.
