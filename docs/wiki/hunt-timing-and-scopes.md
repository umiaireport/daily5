# Hunt timing and evidence scopes

## 1. Timing

The compatible v1 engine keeps its own persisted phase defaults. Hunt v2 uses `server/domain/hunt/v2.ts:HUNT_V2_TIMING`: 2 seconds for the round intro, 12 seconds for whale hiding, 20 seconds for tracer hunting, and 3 seconds for the reveal. `HuntV2Engine.getMatch` applies an overdue transition from the stored deadline, so a refresh or scheduler restart does not reset the clock. Whale and tracer timeouts are recorded as explicit round reasons and award one point to the other role.

`server/services/hunt-service.ts:133` provides `tick`, the scheduler entrypoint that resolves overdue persisted matches and advances computer seats. `server/app.ts` disposes the scheduler during Fastify shutdown.

## 2. Evidence scopes

`server/domain/hunt/evidence.ts:145` attaches asset or board scope and the requested round index to each revealed clue. Asset scans filter historical and simulated events to the selected location. The cross asset rhythm definition is board scoped and labels its answer `All locations`.

`web/hunt/HuntScreen.tsx:55` renders a server clock offset countdown. `web/hunt/HuntScreen.tsx:174` renders the three chart windows, `EvidenceStrip` renders bounded scan results, and `RoundReveal` exposes the selected and hidden zones only after resolution.
