# Worker entrypoint

## Purpose and status

`server/jobs/worker.ts` is a one-shot durable daily-settlement pass. It loads `.env`, claims a SQLite lease, skips challenges before their settlement time, uses stored synthetic exits or Nansen OHLCV closes for due live sources, settles complete challenges, and exits with redacted JSON. It is intentionally not an always-running scheduler: deploy it under cron, a systemd timer, or a hosted scheduled job.

## Functions and control flow

- `numeric` — `server/jobs/worker.ts:53`: accepts only finite positive prices.
- `latestClose` — `server/jobs/worker.ts:59`: extracts the latest valid OHLCV close from single- or batch-token responses.
- `settleDueChallenges` — `server/jobs/worker.ts:71`: claims the worker lease, settles or voids due challenges, and releases the lease on every exit path.
- Top-level JSON status output — `server/jobs/worker.ts:165-168`: reports provider availability and challenge ids without raw payloads or credentials.
