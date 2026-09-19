import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { buildApp } from './server/app.js';

// Vercel supplies project environment variables directly. Loading a local .env
// keeps `vercel dev` and a normal Node production smoke test equivalent.
if (existsSync('.env')) loadEnvFile('.env');

const app = await buildApp({
  databasePath: process.env.DATABASE_PATH ?? '/tmp/daily5.sqlite',
  production: true,
  serveStatic: true,
  logger: false,
});

await app.listen({
  host: '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
});
