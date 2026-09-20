import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoricalDailyFiveCasePack,
  createSyntheticDailyFiveCasePack,
  DailyFiveEngine,
} from '../server/domain/daily-five/index.js';
import { SCENARIOS } from '../fixtures/synthetic/scenarios.js';
import { DAILY_FIVE_V2_RULES } from '../shared/game-rules.js';
import type { HistoricalDailyNansenClient } from '../server/domain/daily-five/historical.js';
import type { Operation, Schema } from '../server/nansen/client.js';
import {
  syntheticObservations,
  observationClue,
} from '../server/domain/daily-five/observations.js';
import { openDatabase } from '../server/db/store.js';
import { normalizeToStartingIndex } from '../web/game-ui/primitives.js';

const DAY = 'daily-2026-09-17';
const HOUR = 3_600_000;

test('provider-backed Daily Five uses real OHLCV and round-scoped trades', async () => {
  const dayStart = Date.parse('2026-09-18T00:00:00.000Z');
  const calls: string[] = [];
  let whaleProbeCalls = 0;
  const scenario = {
    ...SCENARIOS[0]!,
    assets: Array.from({ length: 40 }, (_, index) => ({
      ...SCENARIOS[0]!.assets[index % 3]!,
      id: `provider-${index}`,
      symbol: `REAL${index}`,
      providerChain: 'ethereum',
      providerTokenAddress: `0x${String(index + 1).padStart(40, '0')}`,
    })),
  };
  const client: HistoricalDailyNansenClient = {
    async request<T>(
      operation: Operation,
      body: unknown,
      _requestSchema: Schema<unknown>,
      _responseSchema: Schema<T>,
    ): Promise<{ data: T; cached: boolean }> {
      calls.push(operation);
      const request = body as {
        date?: { from?: string; to?: string };
        token_address?: string;
        filters?: unknown;
      };
      const assetIndex = Math.max(0, Number(request.token_address?.slice(-2) ?? '01') - 1);
      const from = Date.parse(request.date?.from ?? new Date(dayStart - 180 * HOUR).toISOString());
      const to = Date.parse(request.date?.to ?? new Date(dayStart).toISOString());
      if (operation === 'liveCandles') {
        const data = Array.from({ length: Math.ceil((to - from) / HOUR) }, (_, index) => {
          const at = new Date(from + index * HOUR).toISOString();
          const open = 100 + assetIndex * 12 + index * 0.2;
          const close = open + (assetIndex % 2 === 0 ? 0.15 : -0.08);
          return {
            interval_start: at,
            open,
            high: Math.max(open, close) + 0.4,
            low: Math.min(open, close) - 0.4,
            close,
            volume: 10_000 + assetIndex * 500 + index,
          };
        });
        return { cached: false, data: { data } as T };
      }
      const data = Array.from({ length: Math.ceil((to - from) / (6 * HOUR)) }, (_, index) => ({
        block_timestamp: new Date(from + index * 6 * HOUR + HOUR).toISOString(),
        transaction_hash: `0x${assetIndex}-${index}`,
        trader_address: `0xtrader-${assetIndex}-${index}`,
        trader_address_label: index % 2 === 0 ? 'Fund' : 'Retail',
        action: index % 2 === 0 ? 'BUY' : 'SELL',
        estimated_swap_price_usd: 100 + assetIndex,
        estimated_value_usd: (index % 2 === 0 ? 160_000 : 100_000) + assetIndex * 10_000,
      }));
      if (request.filters) {
        whaleProbeCalls += 1;
        return {
          cached: false,
          data: {
            data: [3, 11, 19, 27, 39].includes(assetIndex) ? data.slice(0, 1) : [],
          } as T,
        };
      }
      return { cached: false, data: { data } as T };
    },
  };
  const pack = await createHistoricalDailyFiveCasePack(
    'daily-v2-wallet-2026-09-18',
    dayStart,
    DAILY_FIVE_V2_RULES,
    scenario,
    client,
  );
  assert.equal(calls.filter((operation) => operation === 'liveCandles').length, 40);
  assert.equal(whaleProbeCalls, 40);
  assert.equal(calls.filter((operation) => operation === 'liveTrades').length, 80);
  assert.equal(pack.publicChallenge.rounds.length, 5);
  assert.ok(
    pack.publicChallenge.rounds.every(
      (round) =>
        round.evidence.sourceKind === 'historical-reconstructed' &&
        round.evidence.status === 'available' &&
        round.candidates.length === 5 &&
        round.candidates.every((asset) => asset.coverage.status === 'complete'),
    ),
  );
  assert.equal(
    new Set(
      pack.privateRounds.flatMap((round) => round.candidates.map((asset) => asset.realAssetKey)),
    ).size,
    25,
  );
  assert.equal(
    pack.privateRounds.filter((round) =>
      round.candidates.some((asset) =>
        asset.clues?.some((clue) => clue.factualHeadline.includes('Whale-filtered')),
      ),
    ).length,
    5,
  );
  assert.ok(
    pack.privateRounds[0]!.candidates[0]!.candles.some(
      (candle) => candle.high !== candle.close && candle.low !== candle.close,
    ),
  );
  assert.ok(
    pack.privateRounds[0]!.candidates[0]!.clues?.some((clue) =>
      clue.interpretation.includes('Nansen labeled'),
    ),
  );
});

test('all 25 normalized synthetic charts are deterministic, distinct and strictly pre-cutoff', () => {
  const pack = createSyntheticDailyFiveCasePack(DAY);
  assert.deepEqual(pack, createSyntheticDailyFiveCasePack(DAY));
  const shapes = new Set<string>();
  for (const round of pack.publicChallenge.rounds) {
    assert.deepEqual(
      round.candidates.map((asset) => asset.attemptAlias),
      ['Mystery A', 'Mystery B', 'Mystery C', 'Mystery D', 'Mystery E'],
    );
    for (const asset of round.candidates) {
      assert.equal(asset.chart.length, 72);
      const normalized = normalizeToStartingIndex(asset.chart.map((point) => point.value));
      shapes.add(normalized.map((value) => value.toFixed(3)).join(','));
      assert.ok(Math.max(...normalized) - Math.min(...normalized) > 4);
      asset.chart.forEach((point, index) => {
        assert.ok(Date.parse(point.at) < Date.parse(round.cutoffAt));
        if (index)
          assert.equal(Date.parse(point.at) - Date.parse(asset.chart[index - 1]!.at), 300_000);
      });
      assert.deepEqual(asset.unlockedClues, []);
      assert.ok(
        asset.clueDescriptors.every(
          (clue) => Object.keys(clue).sort().join(',') === 'category,clueId,question,title',
        ),
      );
    }
  }
  assert.equal(shapes.size, 25);
});

test('clues reconcile observed activity, preserve privacy, and ignore later outcomes', (t) => {
  const cutoff = Date.parse('2026-09-17T01:00:00Z');
  const observed = syntheticObservations(1, 0, cutoff);
  const buys = observed.trades.filter((trade) => trade.side === 'buy');
  const sells = observed.trades.filter((trade) => trade.side === 'sell');
  const flow = observationClue('flow', observed);
  assert.equal(flow.factualHeadline, `${buys.length} buy trades · ${sells.length} sell trades`);
  assert.ok(observed.trades.every((trade) => Date.parse(trade.at) < cutoff));
  assert.deepEqual(
    observationClue('crowd', observed).metrics.map((metric) => Number(metric.value)),
    [
      new Set(buys.map((trade) => trade.buyer)).size,
      new Set(sells.map((trade) => trade.seller)).size,
    ],
  );
  const base = createSyntheticDailyFiveCasePack(DAY);
  const changed = {
    ...base,
    privateRounds: base.privateRounds.map((round) => ({
      ...round,
      candidates: round.candidates.map((asset) => ({
        ...asset,
        candles: asset.candles.map((candle) => ({ ...candle, close: candle.high })),
      })),
    })),
  };
  const views = [base, changed].map((pack, index) => {
    const db = openDatabase(':memory:');
    t.after(() => db.close());
    const engine = new DailyFiveEngine(db, {
      clock: () => new Date('2026-09-17T12:00:00Z'),
      casePackFor: () => pack,
    });
    const before = engine.start(DAY, `evidence-${index}`, { idempotencyKey: 'start' });
    assert.doesNotMatch(
      JSON.stringify(before),
      /factualHeadline|realAssetKey|variantId|candles|Net position growth/,
    );
    const asset = before.round!.candidates.find(
      (candidate) => candidate.attemptAlias === 'Mystery A',
    )!;
    return engine
      .unlock(`evidence-${index}`, before.attemptId, {
        kind: 'unlock-clue',
        roundIndex: 1,
        assetId: asset.assetId,
        clueId: asset.clueDescriptors[0]!.clueId,
        expectedStateVersion: before.stateVersion,
        idempotencyKey: 'flow',
      })
      .round!.candidates.find((candidate) => candidate.assetId === asset.assetId)!.unlockedClues;
  });
  assert.deepEqual(views[0], views[1]);
  assert.equal(views[0]!.length, 1);
  assert.equal(views[0]![0]!.factualHeadline, flow.factualHeadline);
});

test('publishing improved fixtures does not rewrite an existing daily challenge', (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const clock = () => new Date('2026-09-17T12:00:00Z');
  const first = new DailyFiveEngine(db, { clock }).today();
  const resumed = new DailyFiveEngine(db, {
    clock,
    casePackFor: () => {
      throw new Error('Published data must not be regenerated');
    },
  }).today();
  assert.deepEqual(resumed, first);
});
