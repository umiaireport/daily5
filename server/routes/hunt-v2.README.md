# Hunt v2 routes

## 1. Purpose

`server/routes/hunt-v2.ts` validates and registers the additive `/api/hunt/v2` HTTP contract. It owns request schemas and structured error responses while delegating state changes to `HuntV2Service`.

## 2. Routes

The registrar exposes match creation, open-seat joining, role-filtered match refresh, commands, and role-swapped rematch. Session identity is supplied by the application coordinator.

The command schema accepts five whale moves (`burst`, `drip`, `blend`, `decoy`, `wait`) and six tracer scans (`flow`, `concentration`, `rhythm`, `timing`, `cross-asset`, `position-growth`).
