import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTemporalIntegrity,
  EvidenceValidationError,
  normalizeCandles,
  normalizeTrades,
  validateCoverage,
} from '../server/evidence/index.js';

const start = '2026-09-17T10:00:00Z';
const cutoff = '2026-09-17T10:20:00Z';
const entry = '2026-09-17T10:20:00Z';
const exit = '2026-09-17T10:35:00Z';

function candles() {
  return [
    {
      interval_start: '2026-09-17T10:00:00Z',
      open: '1.00',
      high: '1.01',
      low: '0.99',
      close: '1.005',
      volume: '10',
      closed: true,
    },
    {
      interval_start: '2026-09-17T10:05:00Z',
      open: '1.005',
      high: '1.02',
      low: '1.00',
      close: '1.015',
      volume: '12',
      closed: true,
    },
    {
      interval_start: '2026-09-17T10:10:00Z',
      open: '1.015',
      high: '1.03',
      low: '1.01',
      close: '1.02',
      volume: '14',
      closed: true,
    },
    {
      interval_start: '2026-09-17T10:15:00Z',
      open: '1.02',
      high: '1.03',
      low: '1.01',
      close: '1.025',
      volume: '16',
      closed: true,
    },
    {
      interval_start: '2026-09-17T10:20:00Z',
      open: '1.025',
      high: '1.04',
      low: '1.02',
      close: '1.03',
      volume: '18',
      closed: true,
    },
    {
      interval_start: '2026-09-17T10:25:00Z',
      open: '1.03',
      high: '1.05',
      low: '1.02',
      close: '1.04',
      volume: '20',
      closed: true,
    },
    {
      interval_start: '2026-09-17T10:30:00Z',
      open: '1.04',
      high: '1.06',
      low: '1.03',
      close: '1.05',
      volume: '22',
      closed: true,
    },
  ];
}

function trades() {
  return [
    {
      timestamp: '2026-09-17T10:01:00Z',
      side: 'BUY',
      price: 1,
      amount: 120_000,
      wallet_address: '0xBUYER1',
    },
    {
      timestamp: '2026-09-17T10:06:00Z',
      side: 'SELL',
      price: 1,
      value_usd: 40_000,
      wallet_address: '0xSELLER1',
    },
    {
      timestamp: '2026-09-17T10:11:00Z',
      side: 'BUY',
      price: 1,
      value_usd: 20_000,
      wallet_address: '0xBUYER2',
    },
    {
      timestamp: '2026-09-17T10:16:00Z',
      side: 'SELL',
      price: 1,
      value_usd: 10_000,
      wallet_address: '0xSELLER2',
    },
  ];
}

function coverage(overrides: Record<string, unknown> = {}) {
  return {
    status: 'complete',
    startAt: start,
    cutoffAt: cutoff,
    observedAt: '2026-09-17T11:00:00Z',
    complete: true,
    truncated: false,
    warnings: [],
    missingMeasurements: [],
    ...overrides,
  };
}

test('provider candle and trade rows normalize without converting absent values to zero', () => {
  const normalizedCandles = normalizeCandles({ data: candles() });
  assert.equal(normalizedCandles[0]!.open, 1);
  assert.equal(normalizedCandles[0]!.volume, 10);
  assert.equal(normalizedCandles[0]!.closed, true);
  const normalizedTrades = normalizeTrades({ data: trades() });
  assert.equal(normalizedTrades[0]!.valueUsd, 120_000);
  assert.equal(normalizedTrades[1]!.amount, null);
  assert.equal(normalizedTrades[0]!.wallet, '0xbuyer1');
});

test('normalization rejects inconsistent OHLC and open required candles', () => {
  assert.throws(
    () =>
      normalizeCandles([{ at: '2026-09-17T10:00:00Z', open: 1, high: 0.9, low: 0.8, close: 0.85 }]),
    (error: unknown) => error instanceof EvidenceValidationError && error.code === 'invalid-candle',
  );
  assert.throws(
    () => normalizeCandles([{ ...candles()[0]!, closed: false }]),
    (error: unknown) => error instanceof EvidenceValidationError && error.code === 'open-candle',
  );
});

test('coverage rejects truncation and omitted batch assets', () => {
  assert.throws(
    () => validateCoverage(coverage({ truncated: true })),
    (error: unknown) =>
      error instanceof EvidenceValidationError && error.code === 'truncated-response',
  );
  assert.throws(
    () =>
      validateCoverage(coverage(), {
        expectedAssetKeys: ['base:one', 'base:two'],
        returnedAssetKeys: ['base:one'],
      }),
    (error: unknown) =>
      error instanceof EvidenceValidationError && error.code === 'missing-batch-asset',
  );
});

test('temporal integrity rejects a future clue input and duplicate candle time', () => {
  const preDecisionCandles = normalizeCandles(candles().slice(0, 4));
  const outcomeCandles = normalizeCandles(candles().slice(4));
  const normalizedTrades = normalizeTrades(trades());
  const valid = {
    evidenceStartAt: start,
    cutoffAt: cutoff,
    entryAt: entry,
    exitAt: exit,
    collectionAt: '2026-09-17T11:00:00Z',
    preDecisionCandles,
    outcomeCandles: [...outcomeCandles, { ...outcomeCandles[0]!, at: '2026-09-17T10:19:00Z' }],
    trades: normalizedTrades,
    snapshots: [],
    coverage: validateCoverage(coverage()),
  };
  assert.throws(
    () => assertTemporalIntegrity(valid),
    (error: unknown) => error instanceof EvidenceValidationError && error.code === 'out-of-order',
  );
  assert.throws(
    () =>
      assertTemporalIntegrity({
        ...valid,
        outcomeCandles,
        preDecisionCandles: [...preDecisionCandles, { ...preDecisionCandles[0]!, at: entry }],
      }),
    (error: unknown) =>
      error instanceof EvidenceValidationError && error.code === 'future-observation',
  );
});
