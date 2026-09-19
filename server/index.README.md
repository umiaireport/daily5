# API process entrypoint

## Purpose and sections

`server/index.ts` loads `.env`, builds the Fastify app with production static serving when requested, listens on `HOST`/`API_PORT`, and closes cleanly on termination signals.

## Functions and control flow

The module is top-level startup code; it has no named functions. The `try` block around `app.listen` and signal handlers are at `server/index.ts:7-20`.
