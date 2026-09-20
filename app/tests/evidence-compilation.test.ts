import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileDailyCase,
  compileHuntBoard,
  EvidenceValidationError,
  type DailyCaseCompileInput,
} from '../server/evidence/index.js';

const start = '2026-09-17T10:00:00Z';
const cutoff = '2026-09-17T10:20:00Z';
const entry = '2026-09-17T10:20:00Z';
const exit = '2026-09-17T10:35:00Z';

function candles(outcomeScale = 1) {
  const pre = [
    [1, 1.01, 0.99, 1.005],
    [1.005, 1.02, 1, 1.015],
    [1.015, 1.03, 1.01, 1.02],
    [1.02, 1.03, 1.01, 1.025],
  ].map(([open, high, low, close], index) => ({
    at: `2026-09-17T10:${String(index * 5).padStart(2, '0')}:00Z`,
    open,
    high,
    low: Math.min(low, close),
    close,
    volume: 10 + index * 2,
    closed: true,
  }));
  const outcome = [
    [1.025, 1.04, 1.02, 1.03],
    [1.03, 1.05, 1.02, 1.04],
    [1.04, 1.06, 1.03, 1.05 * outcomeScale],
  ].map(([open, high, low, close], index) => ({
    at: `2026-09-17T10:${String(20 + index * 5).padStart(2, '0')}:00Z`,
    open,
    high: Math.max(high, close),
    low: Math.min(low, close),
    close,
    volume: 18 + index * 2,
    closed: true,
  }));
  return { pre, outcome };
}

function trades() {
  return [
    { at: '2026-09-17T10:01:00Z', side: 'buy', price: 1, amount: 120_000, wallet: '0xbuyer1' },
    { at: '2026-09-17T10:06:00Z', side: 'sell', price: 1, value_usd: 40_000, wallet: '0xseller1' },
    { at: '2026-09-17T10:11:00Z', side: 'buy', price: 1, value_usd: 20_000, wallet: '0xbuyer2' },
    { at: '2026-09-17T10:16:00Z', side: 'sell', price: 1, value_usd: 10_000, wallet: '0xseller2' },
  ];
}

function input(overrides: Partial<DailyCaseCompileInput> = {}): DailyCaseCompileInput {
  const values = candles();
  return {
    caseId: 'case-one',
    roundIndex: 1,
    sourceKind: 'historical-reconstructed',
    chain: 'base',
    tokenAddress: '0xasset-one',
    symbol: 'ONE',
    name: 'One Token',
    evidenceStartAt: start,
    cutoffAt: cutoff,
    entryAt: entry,
    exitAt: exit,
    collectionAt: '2026-09-17T11:00:00Z',
    preDecisionCandles: values.pre,
    outcomeCandles: values.outcome,
    trades: trades(),
    snapshots: [],
    coverage: {
      status: 'complete',
      description: 'Fixture coverage',
      observedAt: '2026-09-17T11:00:00Z',
      startAt: start,
      cutoffAt: cutoff,
      complete: true,
      truncated: false,
      warnings: [],
      missingAssets: [],
      missingMeasurements: [],
      expectedCandleIntervalMinutes: 5,
    },
    attribution: [{ label: 'Fixture historical source', sourceKind: 'historical-reconstructed' }],
    ...overrides,
  };
}

test('daily case compilation derives six pre-decision clues and a safe public projection', () => {
  const compiled = compileDailyCase(input());
  assert.deepEqual(Object.keys(compiled.clues).sort(), [
    'absorption',
    'crowd',
    'flow',
    'volatility',
    'volume',
    'whale-footprint',
  ]);
  assert.equal(compiled.publicEvidence.chart.length, 4);
  assert.equal(compiled.publicEvidence.unlockedClues.length, 0);
  assert.equal(compiled.publicEvidence.currentPrice, '1.02500000');
  assert.equal(compiled.publicEvidence.changePct, '+1.99%');
  assert.equal(compiled.publicEvidence.volumeUsd, '$190,000');
  const publicJson = JSON.stringify(compiled.publicEvidence);
  assert.equal(publicJson.includes('0xasset-one'), false);
  assert.equal(publicJson.includes('One Token'), false);
  assert.ok(
    compiled.publicEvidence.chart.every((point) => Date.parse(point.at) < Date.parse(cutoff)),
  );
  assert.equal(publicJson.includes('outcomeCandles'), false);
  assert.equal(compiled.sourceKind, 'historical-reconstructed');
});

test('altering outcome candles leaves earlier clue facts unchanged', () => {
  const before = compileDailyCase(input());
  const changed = compileDailyCase({
    ...input(),
    caseId: 'case-changed-outcome',
    tokenAddress: '0xasset-two',
    outcomeCandles: candles(0.8).outcome,
  });
  assert.deepEqual(changed.clues, before.clues);
  assert.notDeepEqual(changed.matching.liquidation, before.matching.liquidation);
});

test('compiler rejects future clue candles and incomplete published coverage', () => {
  assert.throws(
    () =>
      compileDailyCase({
        ...input(),
        preDecisionCandles: [...candles().pre, candles().outcome[0]!],
      }),
    (error: unknown) =>
      error instanceof EvidenceValidationError && error.code === 'future-observation',
  );
  assert.throws(
    () =>
      compileDailyCase({
        ...input(),
        coverage: { ...(input().coverage as Record<string, unknown>), truncated: true },
      }),
    (error: unknown) =>
      error instanceof EvidenceValidationError && error.code === 'truncated-response',
  );
});

test('hunt board keeps six distinct real assets while exposing only public evidence', () => {
  const cases = Array.from({ length: 6 }, (_, index) =>
    compileDailyCase(
      input({
        caseId: `hunt-case-${index + 1}`,
        roundIndex: index + 1,
        tokenAddress: `0xhunt-${index + 1}`,
      }),
    ),
  );
  const board = compileHuntBoard({ boardId: 'hunt-fixture', cases });
  assert.equal(board.assets.length, 6);
  assert.equal(board.publicAssets.length, 6);
  assert.equal(JSON.stringify(board.publicAssets).includes('0xhunt-1'), false);
  assert.equal(JSON.stringify(board.publicAssets).includes('outcomeCandles'), false);
});
