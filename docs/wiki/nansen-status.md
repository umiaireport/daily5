# `server/nansen/status.ts`

`providerStatus` (`server/nansen/status.ts:1`) returns an actionable synthetic-mode reason based on whether a key exists. Explicit live mode reports its own collection state from `buildApp`; the API uses this status for the daily challenge, health/admin status, and worker message.
