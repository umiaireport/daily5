# Vercel entrypoint

`index.ts` is the production entrypoint for Vercel. It loads local environment variables when available, builds the Fastify app with static Vite assets enabled, uses `/tmp/daily5.sqlite` by default for disposable previews, and listens on the platform-provided `PORT`. Local development continues to use `server/index.ts` through `npm run dev`.
