# `server/index.ts`

Top-level startup (`server/index.ts:5-20`) loads `.env`, builds the app, listens on `HOST` and `API_PORT`, logs startup failures, and closes on SIGINT/SIGTERM. It is the API process used by `npm run dev`, `npm start`, and the Vite proxy.
