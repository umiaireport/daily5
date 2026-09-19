import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignVariant,
  compileDailyCase,
  deserializeVariantAssignment,
  matchVariants,
  serializeVariantAssignment,
  type DailyCaseCompileInput,
} from '../server/evidence/index.js';

const start = '2026-09-17T10:00:00Z';
const cutoff = '2026-09-17T10:20:00Z';
const entry = '2026-09-17T10:20:00Z';
const exit = '2026-09-17T10:35:00Z';

function rawCase(
  id: string,
  roundIndex: number,
  address: string,
  liquidation = false,
): DailyCaseCompileInput {
  const pre = [0, 5, 10, 15].map((minutes, index) => ({
    at: `2026-09-17T10:${String(minutes).padStart(2, '0')}:00Z`,
    open: 1 + index * 0.005,
    high: 1.01 + index * 0.005,
    low: 0.99 + index * 0.005,
    close: 1.005 + index * 0.005,
    volume: 10 + index,
    closed: true,
  }));
  const outcome = [
    {
      at: entry,
      open: 1.025,
      high: 1.04,
      low: liquidation ? 0.98 : 1.02,
      close: 1.03,
      volume: 18,
      closed: true,
    },
    {
      at: '2026-09-17T10:25:00Z',
      open: 1.03,
      high: 1.05,
      low: 1.02,
      close: 1.04,
      volume: 20,
      closed: true,
    },
    {
      at: '2026-09-17T10:30:00Z',
      open: 1.04,
      high: 1.06,
      low: 1.03,
      close: 1.05,
      volume: 22,
      closed: true,
    },
  ];
  return {
    caseId: id,
    roundIndex,
    sourceKind: 'historical-reconstructed',
    chain: 'base',
    tokenAddress: address,
    symbol: `S${roundIndex}`,
    name: `Synthetic ${roundIndex}`,
    evidenceStartAt: start,
    cutoffAt: cutoff,
    entryAt: entry,
    exitAt: exit,
    collectionAt: '2026-09-17T11:00:00Z',
    preDecisionCandles: pre,
    outcomeCandles: outcome,
    trades: [
      { at: '2026-09-17T10:01:00Z', side: 'buy', price: 1, amount: 120_000, wallet: `${id}-b1` },
      { at: '2026-09-17T10:06:00Z', side: 'sell', price: 1, value_usd: 40_000, wallet: `${id}-s1` },
      { at: '2026-09-17T10:11:00Z', side: 'buy', price: 1, value_usd: 20_000, wallet: `${id}-b2` },
      { at: '2026-09-17T10:16:00Z', side: 'sell', price: 1, value_usd: 10_000, wallet: `${id}-s2` },
    ],
    snapshots: [],
    coverage: {
      status: 'complete',
      description: 'Comparable fixture coverage',
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
    attribution: [{ label: 'Historical fixture', sourceKind: 'historical-reconstructed' }],
  };
}

function pack(prefix: string, liquidation = false) {
  return Array.from({ length: 5 }, (_, index) =>
    compileDailyCase(
      rawCase(`${prefix}-${index + 1}`, index + 1, `0x${prefix}-${index + 1}`, liquidation),
    ),
  );
}

test('comparable packs use different real assets and are grouped into one family', () => {
  const result = matchVariants([pack('alpha'), pack('beta')]);
  assert.equal(result.families.length, 1);
  assert.equal(result.families[0]!.packs.length, 2);
  assert.deepEqual(result.rejected, []);
  const firstAssets = new Set(
    result.families[0]!.packs[0]!.cases.map((value) => value.tokenAddress),
  );
  const secondAssets = new Set(
    result.families[0]!.packs[1]!.cases.map((value) => value.tokenAddress),
  );
  assert.equal(
    [...firstAssets].some((value) => secondAssets.has(value)),
    false,
  );
});

test('liquidation paths are part of matching and cannot be hidden by similar terminal returns', () => {
  const result = matchVariants([pack('stable'), pack('liquidated', true)]);
  assert.equal(result.families.length, 2);
  assert.equal(
    result.families.every((family) => family.packs.length === 1),
    true,
  );
  assert.notDeepEqual(
    result.families[0]!.packs[0]!.cases[0]!.matching.liquidation,
    result.families[1]!.packs[0]!.cases[0]!.matching.liquidation,
  );
});

test('assignment is deterministic, private, and survives JSON round trip', () => {
  const family = matchVariants([pack('alpha'), pack('beta')]).families[0]!;
  const assignment = assignVariant(family, 'attempt-123', {
    seed: 'fixed-seed',
    assignedAt: '2026-09-17T12:00:00Z',
  });
  const restored = deserializeVariantAssignment(serializeVariantAssignment(assignment), family);
  assert.deepEqual(restored, assignment);
  assert.equal(new Set(assignment.caseIds).size, 5);
  assert.equal(JSON.stringify(assignment).includes('tokenAddress'), false);
  assert.equal(assignment.comparisonScope, 'exact-variant');
  assert.equal(assignment.practiceOnly, false);
});

test('a repeated real asset is rejected instead of becoming a variant', () => {
  const repeated = pack('repeated');
  const duplicate = repeated.map((value, index) =>
    index === 1 ? { ...value, tokenAddress: repeated[0]!.tokenAddress } : value,
  );
  const result = matchVariants([duplicate]);
  assert.equal(result.families.length, 0);
  assert.equal(result.rejected[0]?.reason, 'repeated-real-asset');
});
