# Hunt v2 service

## 1. Purpose

`server/services/hunt-v2.ts` connects the persisted v2 engine to Fastify and advances the computer opponent. It accepts an optional board factory so live mode can reuse the validated Nansen scenario while synthetic mode stays deterministic. It starts a short scheduler so overdue rounds and computer turns continue after browser polling or a service restart.

## 2. Functions

- `createMatch`, `joinMatch`, `getMatch`, `command`, and `rematch` expose the route-facing operations.
- `dispose` stops the scheduler during Fastify shutdown.
- `runOneBotAction` makes one role-filtered deterministic computer move using the same commands available to a human.
