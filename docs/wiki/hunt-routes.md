# Whale Hunt routes

## 1. Registration

`registerHuntRoutes` (`server/routes/hunt.ts:131`) registers the room, match, command, and post-match reveal routes. It receives `HuntEngine` and a caller identity resolver, so application startup and cookie configuration remain coordinator-owned.

## 2. Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/hunt/rooms` | Create a persisted setup match |
| POST | `/api/hunt/rooms/:code/join` | Join as a tracer |
| GET | `/api/hunt/matches/:id` | Return a role-filtered view |
| POST | `/api/hunt/matches/:id/commands` | Apply one validated Hunt command |
| GET | `/api/hunt/matches/:id/replay` | Return the shared reveal replay after ending |

`identity` (`:114`) resolves a session actor. `sendError` (`:95`) maps domain and schema failures to structured HTTP errors. Queue endpoints remain Milestone 7 work.
