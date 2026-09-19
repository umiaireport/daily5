# Hunt browser and HTTP contracts

## 1. Existing contract

`web/api/hunt.ts` continues to transport the compatible Hunt v1 room, queue, match, command, reconnect, and replay routes. Existing clients can read old records through that contract.

## 2. Hunt v2 contract

`web/api/hunt-v2.ts` implements the redesigned duel transport:

- `POST /api/hunt/v2/matches` creates a Whale or Tracer match against a computer.
- `POST /api/hunt/v2/matches/:id/join` claims the open opponent seat for a second human before the round starts.
- `GET /api/hunt/v2/matches/:id` returns the actor's role-filtered v2 view.
- `POST /api/hunt/v2/matches/:id/commands` accepts plan, hide, scan, catch, and forfeit commands.
- `POST /api/hunt/v2/matches/:id/rematch` starts a new match with roles swapped.

Every mutation carries the observed state version and an idempotency key. `HuntV2ApiError` preserves server code, retryability, and state metadata so the screen can refresh after a lost response.

The command schema accepts five whale moves and six scan lanes. Live mode does not change the HTTP contract: the same `HuntV2MatchView` carries public provider market context when the server successfully collected a live scenario.

## 3. Privacy boundary

The v2 response contains only public windows, public scan results, scores, and resolved round facts. The whale selection is present only in a whale view during the hide phase. `hiddenZone` and `roundResult` appear only after resolution.
