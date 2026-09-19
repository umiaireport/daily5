import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { loadEnvFile } from 'node:process';
import { openDatabase } from '../db/store.js';
import {
  acquireDailyLease,
  dailySettlementSources,
  initializeDailyDatabase,
  pendingDailyChallenges,
  releaseDailyLease,
} from '../db/daily.js';
import { DailyGame, type DailyChallenge } from '../domain/daily.js';
import { createNansenClient, type Schema } from '../nansen/client.js';
import { configuredNansenApiKey } from '../nansen/config.js';
import { providerStatus } from '../nansen/status.js';

if (existsSync('.env')) loadEnvFile('.env');
if (existsSync('../.env')) loadEnvFile('../.env');
if (existsSync('../../.env')) loadEnvFile('../../.env');

const passThrough: Schema<unknown> = { parse: (input) => input };
const ohlcvResponse: Schema<{
  data?: Record<string, unknown>[];
  tokens?: { data: Record<string, unknown>[] }[];
}> = {
  parse(input) {
    if (!input || typeof input !== 'object') throw new Error('OHLCV response is not an object.');
    const value = input as { data?: unknown; tokens?: unknown };
    const data = Array.isArray(value.data)
      ? value.data.filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object'),
        )
      : undefined;
    const tokens = Array.isArray(value.tokens)
      ? value.tokens
          .filter((item): item is { data: Record<string, unknown>[] } =>
            Boolean(
              item && typeof item === 'object' && Array.isArray((item as { data?: unknown }).data),
            ),
          )
          .map((item) => ({
            data: item.data.filter((point): point is Record<string, unknown> =>
              Boolean(point && typeof point === 'object'),
            ),
          }))
      : undefined;
    if (!data?.length && !tokens?.some((item) => item.data.length))
      throw new Error('OHLCV response contains no candles.');
    return { data, tokens };
  },
};

function numeric(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function latestClose(value: {
  data?: Record<string, unknown>[];
  tokens?: { data: Record<string, unknown>[] }[];
}): number | null {
  const points = value.data ?? value.tokens?.flatMap((token) => token.data) ?? [];
  for (const point of [...points].reverse()) {
    const close = numeric(point.close);
    if (close !== null) return close;
  }
  return null;
}

async function settleDueChallenges(): Promise<{
  settled: string[];
  voided: string[];
  pending: string[];
}> {
  const databasePath = process.env.DATABASE_PATH ?? './data/whale-arena.sqlite';
  const db = openDatabase(databasePath);
  initializeDailyDatabase(db);
  const owner = `${hostname()}-${randomUUID()}`;
  const leaseName = 'daily-settlement';
  const settled: string[] = [];
  const voided: string[] = [];
  const pending: string[] = [];
  if (!acquireDailyLease(db, leaseName, owner, 120_000)) {
    db.close();
    return { settled, voided, pending };
  }
  const apiKey = configuredNansenApiKey();
  const client = apiKey
    ? createNansenClient({
        enabled: true,
        apiKey,
        creditBudget: Number(process.env.NANSEN_CREDIT_BUDGET ?? 10),
        verifiedCreditHeader: 'x-nansen-credits-cost',
      })
    : null;
  const daily = new DailyGame(db);
  try {
    for (const row of pendingDailyChallenges(db)) {
      const challenge = JSON.parse(row.payload) as DailyChallenge;
      const now = Date.now();
      if (now < Date.parse(challenge.settleAt)) continue;
      if (now >= Date.parse(challenge.voidAt)) {
        daily.settle(challenge.id, null);
        voided.push(challenge.id);
        continue;
      }
      const sources = dailySettlementSources(db, challenge.id);
      if (sources.length !== 3) {
        pending.push(challenge.id);
        continue;
      }
      const prices: { assetId: string; entry: number | null; exit: number | null }[] = [];
      for (const assetId of challenge.assetIds) {
        const source = sources.find((item) => item.assetId === assetId);
        if (!source) break;
        let exit = source.fallbackExitPrice;
        if (source.kind === 'nansen') {
          if (!client || !source.chain || !source.tokenAddress) {
            exit = null;
          } else {
            try {
              const response = await client.request(
                'liveCandles',
                {
                  chain: source.chain,
                  token_address: source.tokenAddress,
                  timeframe: '1h',
                  date: {
                    from: new Date(now - 86_400_000).toISOString(),
                    to: new Date(now).toISOString(),
                  },
                },
                passThrough,
                ohlcvResponse,
              );
              exit = latestClose(response.data);
            } catch {
              exit = null;
            }
          }
        }
        prices.push({ assetId, entry: source.entryPrice, exit });
      }
      if (prices.length !== 3 || prices.some((price) => price.exit === null)) {
        pending.push(challenge.id);
        continue;
      }
      const status = daily.settle(challenge.id, {
        version: sources.some((source) => source.kind === 'nansen')
          ? 'nansen-ohlcv-v1'
          : 'synthetic-replay-v1',
        prices,
      });
      if (status === 'settled') settled.push(challenge.id);
      else pending.push(challenge.id);
    }
    return { settled, voided, pending };
  } finally {
    releaseDailyLease(db, leaseName, owner);
    db.close();
  }
}

const result = await settleDueChallenges();
console.log(
  JSON.stringify({ worker: 'whale-arena', status: 'ready', ...providerStatus(), ...result }),
);
