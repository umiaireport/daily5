import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

for (const file of ['.env', '../.env', '../../.env']) if (existsSync(file)) loadEnvFile(file);
process.env.DATA_MODE = 'live';
process.env.DAILY_FIVE_DOWNLOAD = 'true';
process.env.NANSEN_LIVE_HUNT = 'false';
// Up to 40 Whale probes, 40 general DEX-trade requests, and 40 OHLCV coverage
// probes are needed to select five fresh pools. The client enforces this
// ceiling; normal app startup never collects.
process.env.NANSEN_CREDIT_BUDGET = process.env.DAILY_FIVE_DOWNLOAD_BUDGET ?? '160';

const { buildApp } = await import('../server/app.js');
const app = await buildApp({ dataMode: 'live', logger: false });
try {
  const response = await app.inject({ method: 'GET', url: '/api/daily-five/today' });
  if (response.statusCode >= 400)
    throw new Error(`Daily Five download failed (${response.statusCode}): ${response.body}`);
  const body = response.json() as {
    dailyId?: string;
    cohort?: string;
    rounds?: readonly { candidates?: readonly unknown[] }[];
  };
  console.log(
    JSON.stringify({
      saved: true,
      dailyId: body.dailyId,
      cohort: body.cohort,
      rounds: body.rounds?.length ?? 0,
      candidates: body.rounds?.map((round) => round.candidates?.length ?? 0) ?? [],
    }),
  );
} finally {
  await app.close();
}
