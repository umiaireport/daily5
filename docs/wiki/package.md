# `package.json`

The package manifest pins Node `>=24.0.0 <25`, React 19, Vite 8, Fastify 5, TypeScript 7, Playwright, Prettier 3, and supporting packages. Scripts at `package.json:10-20` cover dev, typecheck, formatting, build, start, unit tests, e2e tests, migration, the development-only Daily Five reset, and the one-shot daily settlement worker (schedule it externally in production). `package-lock.json` is the reproducible install contract.
