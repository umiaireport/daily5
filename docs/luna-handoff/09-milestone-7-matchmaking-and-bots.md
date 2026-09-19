# Milestone 7 — Matchmaking and computer players

## 1. Prompt and ownership

Read [shared rules](01-shared-rules.md). Own `server/matchmaking/*`, `server/bots/*`, `server/services/hunt-service.ts`, `tests/matchmaking-*.test.ts`, and `tests/bots-*.test.ts`. Depends on the hunt command boundary; run alongside milestone 8.

## 2. Match availability

Respect role and mode, wait at most eight seconds for compatible humans, then fill empty seats with computers. “Play computers now” skips the queue. Roster locks at start; newly arriving humans do not replace initial bots mid-match.

A lone tracer gets a computer whale; a lone whale gets computer tracers. Crew mode fills every missing tracer seat. Display computer labels honestly.

Queue claims and match creation are transactional. Resolve arrival at the timeout boundary without duplicate seats, duplicate matches, or abandoned queued memberships. Queue completion requires no browser refresh.

## 3. Fair bot architecture

Use deterministic server-side policy agents, not paid LLM calls during play. Persist each bot's random seed independently from case-assignment seeds. Functions take sanitized role observations and return commands; never pass the database or complete hidden match object.

Whale bot sees its targets, legal budget, and visible background. It prioritizes mission completion while varying Burst/Drip/Blend/Decoy/Wait. It cannot inspect private tracer suspicions or future windows.

Tracer bot sees the same board and purchased evidence as humans. It chooses scans, updates suspects, can be distracted, and can be wrong. It cannot inspect target IDs or hidden plans/events.

Crew personalities: Flow analyst, Timing analyst, Concentration analyst, Skeptic, Coordinator. Personalities change scan preferences, not available information. Coordinate shared scans to avoid wasting budget on duplicates.

Every bot command goes through the same actor, phase, budget, and idempotency checks as human commands. Initial difficulty is Standard only. More difficulty levels must alter strategy, not grant hidden knowledge.

## 4. Time, disconnect, and restart

Initial phase deadlines: 25 seconds for whale planning, 35 seconds for investigation. No minimum wait when all required decisions are ready. Normal bot decisions resolve within 250–750ms; no long artificial thought animation.

Persist server deadlines. Reconnect grace is 15 seconds. Phase expiry during grace follows a consistent timeout rule. After grace, a labeled computer can take over. Returning humans regain control only at a safe phase boundary. Record substitutions in results and transfer a disconnected captain when needed.

Define timeout defaults explicitly and test them. A whale timeout may use a legal fallback policy through the same command validator; it must not receive an unearned completed mission. Tracer timeout retains a previously valid suspicion or records no decision according to the frozen rule; no extra scans. Never use hidden information to recover a match.

On restart, process overdue queue and match deadlines idempotently. Do not depend only on in-memory timers. Human control and bot takeover cannot both submit an action for one seat/phase.

## 5. Acceptance

- A lone human finishes either role in Duel and Crew Hunt.
- Queue timeout works without refresh and is race-safe.
- Identical seed/observations reproduce bot decisions.
- Secret fields cannot enter bot inputs.
- Bots obey legal budgets and can make plausible mistakes.
- Reconnect/takeover cannot duplicate actions or change past results.
- Server restart resolves persisted deadlines once.
