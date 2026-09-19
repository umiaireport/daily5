# Hunt v2 shared contract

## 1. Purpose

`shared/hunt-v2.ts` defines the versioned Whale Hunt duel contract. It describes the three public windows, five whale moves, six evidence scans, optional market and Smart Money context, one-point round results, role-filtered views, commands, and browser transport.

## 2. Key types

- `HuntV2MatchView` is the server-shaped public and role-filtered match view.
- `HuntV2Command` covers private plan selection, hide confirmation, scans, catch lock-in, and forfeit.
- `HuntV2RoundResult` exposes the hidden zone and explanation only after resolution.
- `HuntV2Transport` is the browser/server boundary used by `HuntScreen`, including the open-seat `joinMatch` operation for human duels.
