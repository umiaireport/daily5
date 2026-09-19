# `server/jobs/worker.ts`

`settleDueChallenges` (`server/jobs/worker.ts:71`) is the one-shot provider scheduler pass: it claims a SQLite lease, waits until each pinned challenge reaches `settleAt`, fetches the latest Nansen OHLCV close for live sources, uses immutable synthetic fallback prices when applicable, and settles or voids through `DailyGame`. The top-level flow (`server/jobs/worker.ts:165-168`) prints redacted JSON and exits. Run it from cron/systemd/a hosted scheduler; the worker itself is deliberately not an always-running process.
