# `vite.config.ts`

Top-level Vite configuration (`vite.config.ts:4-23`) enables the React plugin, proxies `/api` and `/healthz` to Fastify `:8411`, emits the production bundle to `dist`, and denies browser access to `.env`, certificates, `.git`, server/fixture/test/data/runtime/backup paths. This boundary is regression-tested by the browser suite; direct fixture requests return 403/404 rather than exposing hidden synthetic prices.
