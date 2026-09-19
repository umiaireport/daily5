# Whale Hunt routes

## 1. Purpose

`server/routes/hunt.ts` registers the frozen Hunt HTTP boundary. It accepts a supplied session identity resolver and does not own cookies, startup, migrations, or global error handling.

## 2. Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/hunt/rooms` | Create a one-tracer or five-tracer setup room |
| POST | `/api/hunt/rooms/:code/join` | Join a setup room as a tracer |
| GET | `/api/hunt/matches/:id` | Return the caller’s role-filtered match view |
| POST | `/api/hunt/matches/:id/commands` | Validate and apply one Hunt command |
| GET | `/api/hunt/matches/:id/replay` | Return the frozen shared reveal replay shape after completion |

`registerHuntRoutes` (`server/routes/hunt.ts:131`) installs the routes. `identity` (`:114`) resolves the caller, `sendError` (`:95`) serializes Hunt and Zod errors, and `safely` (`:122`) preserves structured failures.

## 3. Integration boundary

Queue endpoints remain outside Milestone 5 and belong to Milestone 7. The current shared room view does not return a match id, so the coordinator must resolve that contract before wiring the browser journey.
