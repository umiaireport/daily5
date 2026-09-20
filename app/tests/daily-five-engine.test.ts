import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/db/store.js';
import {
  createSyntheticDailyFiveCasePack,
  DailyFiveEngine,
  evaluatePosition,
  findLiquidation,
  type DailyFiveCasePack,
} from '../server/domain/daily-five/index.js';
import { DAILY_FIVE_V2_RULES, price, priceFromUnits, type Price } from '../shared/game-rules.js';

const DAY = 'daily-2026-09-17';

function candle(at: string, open: Price, high: Price, low: Price, close: Price) {
  return { at, open, high, low, close, closed: true } as const;
}

function packWithCandles(candles: readonly ReturnType<typeof candle>[]): DailyFiveCasePack {
  const base = createSyntheticDailyFiveCasePack(DAY);
  return {
    ...base,
    privateRounds: base.privateRounds.map((round, roundIndex) => ({
      ...round,
      candidates: round.candidates.map((candidate, candidateIndex) => ({
        ...candidate,
        candles: candles.length > 0 ? candles : candidate.candles,
        variantId: `test-${roundIndex}-${candidateIndex}`,
      })),
    })),
  };
}

function clock() {
  return new Date('2026-09-17T12:00:00.000Z');
}

test('a saved historical publication remains open for official attempts after UTC rolls over', () => {
  const db = openDatabase(':memory:');
  try {
    const dailyId = 'daily-v3-provider-2026-09-18';
    const pack = createSyntheticDailyFiveCasePack(
      dailyId,
      Date.parse('2026-09-18T00:00:00.000Z'),
      DAILY_FIVE_V2_RULES,
    );
    const engine = new DailyFiveEngine(db, {
      clock: () => new Date('2026-09-19T07:00:00.000Z'),
      rules: DAILY_FIVE_V2_RULES,
      publishedDailyId: dailyId,
      casePackFor: () => pack,
    });

    const started = engine.start(dailyId, 'historical-player', { idempotencyKey: 'start' });
    assert.equal(started.phase, 'round-open');
  } finally {
    db.close();
  }
});

test('Daily Five fixed-point settlement matches leverage examples and signed rounding', () => {
  const candles = [
    candle(
      '2026-09-17T12:00:00.000Z',
      price('1.00000000'),
      price('1.02000000'),
      price('1.00000000'),
      price('1.02000000'),
    ),
  ];
  assert.equal(evaluatePosition({ side: 'long', leverage: 1, candles }).endingEquity, '10190.00');
  assert.equal(evaluatePosition({ side: 'long', leverage: 10, candles }).endingEquity, '11900.00');
  assert.equal(
    evaluatePosition({
      side: 'short',
      leverage: 10,
      candles: [
        candle(
          '2026-09-17T12:00:00.000Z',
          price('1.00000000'),
          price('1.00000000'),
          price('0.98000000'),
          price('0.98000000'),
        ),
      ],
    }).endingEquity,
    '11900.00',
  );
  assert.equal(priceFromUnits(99_010_000n), '0.99010000');
  assert.deepEqual(
    evaluatePosition({
      side: 'long',
      leverage: 100,
      candles: [
        candle(
          '2026-09-17T12:00:00.000Z',
          price('1.00000000'),
          price('1.02000000'),
          price('0.99010000'),
          price('1.02000000'),
        ),
      ],
    }),
    {
      entryPrice: '1.00000000',
      exitPrice: '0.99010000',
      endingEquity: '0.00',
      returnPct: '-100.00',
      liquidated: true,
      liquidation: {
        candleIndex: 0,
        at: '2026-09-17T12:00:00.000Z',
        price: '0.99010000',
        equity: '0.00',
      },
    },
  );
});

test('intraperiod adverse extremes liquidate before a recovered close and never create debt', () => {
  const result = evaluatePosition({
    side: 'long',
    leverage: 100,
    candles: [
      candle(
        '2026-09-17T12:00:00.000Z',
        price('1.00000000'),
        price('1.02000000'),
        price('0.98000000'),
        price('1.02000000'),
      ),
    ],
  });
  assert.equal(result.liquidated, true);
  assert.equal(result.endingEquity, '0.00');
  assert.equal(
    findLiquidation({
      side: 'long',
      leverage: 100,
      candles: result.liquidation
        ? [
            candle(
              result.liquidation.at,
              price('1.00000000'),
              price('1.02000000'),
              price('0.98000000'),
              price('1.02000000'),
            ),
          ]
        : [],
    })?.price,
    '0.98000000',
  );
});

test('lifecycle persists clues, immediate results, idempotency, phase guards, and refresh recovery', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'whale-daily-five-')), 'game.sqlite');
  const firstDb = openDatabase(databasePath);
  const first = new DailyFiveEngine(firstDb, clock);
  const started = first.start(DAY, 'player-1', { idempotencyKey: 'start-1' });
  assert.equal(started.phase, 'round-open');
  assert.equal(started.currentRoundIndex, 1);
  assert.equal(
    first.start(DAY, 'player-1', { idempotencyKey: 'start-1' }).attemptId,
    started.attemptId,
  );
  assert.equal(
    first.start(DAY, 'player-1', { idempotencyKey: 'start-practice' }).phase,
    'round-open',
  );
  const candidate = started.round!.candidates[0]!;
  const clue = candidate.clueDescriptors[0]!;
  const unlocked = first.unlock('player-1', started.attemptId, {
    kind: 'unlock-clue',
    roundIndex: 1,
    assetId: candidate.assetId,
    clueId: clue.clueId,
    expectedStateVersion: 1,
    idempotencyKey: 'clue-1',
  });
  assert.equal(unlocked.round!.unlocksRemaining, 2);
  assert.equal(
    first.unlock('player-1', started.attemptId, {
      kind: 'unlock-clue',
      roundIndex: 1,
      assetId: candidate.assetId,
      clueId: clue.clueId,
      expectedStateVersion: 2,
      idempotencyKey: 'clue-retry',
    }).stateVersion,
    2,
  );
  const submitted = first.submit('player-1', started.attemptId, {
    kind: 'cash',
    roundIndex: 1,
    expectedStateVersion: 2,
    idempotencyKey: 'ticket-1',
  });
  assert.equal(submitted.phase, 'saved-result');
  assert.equal(submitted.savedResult?.result.endingEquity, '10000.00');
  assert.deepEqual(
    first.submit('player-1', started.attemptId, {
      kind: 'cash',
      roundIndex: 1,
      expectedStateVersion: 2,
      idempotencyKey: 'ticket-1',
    }),
    submitted,
  );
  assert.throws(
    () =>
      first.submit('player-1', started.attemptId, {
        kind: 'cash',
        roundIndex: 1,
        expectedStateVersion: 3,
        idempotencyKey: 'changed-ticket',
      }),
    /open round|saved result/i,
  );
  assert.throws(
    () =>
      first.submit('player-1', started.attemptId, {
        kind: 'cash',
        roundIndex: 3,
        expectedStateVersion: 3,
        idempotencyKey: 'future-ticket',
      }),
    /open round/i,
  );
  const next = first.continue('player-1', started.attemptId, {
    kind: 'continue',
    roundIndex: 1,
    expectedStateVersion: 3,
    idempotencyKey: 'continue-1',
  });
  assert.equal(next.phase, 'round-open');
  assert.equal(next.currentRoundIndex, 2);
  firstDb.close();
  const secondDb = openDatabase(databasePath);
  const second = new DailyFiveEngine(secondDb, clock);
  const resumed = second.resume('player-1', started.attemptId);
  assert.deepEqual(resumed, next);
  secondDb.close();
});

test('five cash tickets finish at exactly 50000 and five liquidations finish at zero', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'whale-daily-five-final-')), 'game.sqlite');
  const db = openDatabase(databasePath);
  const engine = new DailyFiveEngine(db, {
    clock,
    casePackFor: () =>
      packWithCandles([
        candle(
          '2026-09-17T12:00:00.000Z',
          price('1.00000000'),
          price('1.10000000'),
          price('0.50000000'),
          price('1.10000000'),
        ),
      ]),
  });
  const started = engine.start(DAY, 'cash-player', { idempotencyKey: 'cash-start' });
  let state = started;
  for (let roundIndex = 1; roundIndex <= 5; roundIndex += 1) {
    state = engine.submit('cash-player', started.attemptId, {
      kind: 'cash',
      roundIndex,
      expectedStateVersion: state.stateVersion,
      idempotencyKey: `cash-ticket-${roundIndex}`,
    });
    state = engine.continue('cash-player', started.attemptId, {
      kind: 'continue',
      roundIndex,
      expectedStateVersion: state.stateVersion,
      idempotencyKey: `cash-continue-${roundIndex}`,
    });
  }
  assert.equal(state.phase, 'final-result');
  assert.equal(state.finalResult?.totalEquity, '50000.00');
  assert.equal(state.finalResult?.returnPct, '0.00');

  const liquidations = engine.start(DAY, 'liquidation-player', { idempotencyKey: 'liq-start' });
  let liquidationState = liquidations;
  for (let roundIndex = 1; roundIndex <= 5; roundIndex += 1) {
    liquidationState = engine.submit('liquidation-player', liquidations.attemptId, {
      kind: 'trade',
      roundIndex,
      assetId: liquidationState.round!.candidates[0]!.assetId,
      side: 'long',
      leverage: 100,
      expectedStateVersion: liquidationState.stateVersion,
      idempotencyKey: `liq-ticket-${roundIndex}`,
    });
    assert.equal(liquidationState.savedResult?.result.endingEquity, '0.00');
    liquidationState = engine.continue('liquidation-player', liquidations.attemptId, {
      kind: 'continue',
      roundIndex,
      expectedStateVersion: liquidationState.stateVersion,
      idempotencyKey: `liq-continue-${roundIndex}`,
    });
  }
  assert.equal(liquidationState.finalResult?.totalEquity, '0.00');
  assert.equal(liquidationState.finalResult?.returnPct, '-100.00');
  db.close();
});

test('v2 keeps real asset names private until a portfolio result is saved', () => {
  const db = openDatabase(':memory:');
  try {
    const engine = new DailyFiveEngine(db, {
      clock,
      rules: DAILY_FIVE_V2_RULES,
      casePackFor: (dailyId) =>
        createSyntheticDailyFiveCasePack(dailyId, undefined, DAILY_FIVE_V2_RULES),
    });
    const started = engine.start('daily-v2-wallet-2026-09-17', 'v2-player', {
      idempotencyKey: 'v2-start',
    });
    const candidate = started.round!.candidates.find((asset) => asset.assetId === 'daily-1-0')!;
    assert.doesNotMatch(JSON.stringify(started), /Synthetic Asset|realAssetName/);

    const submitted = engine.submit('v2-player', started.attemptId, {
      kind: 'portfolio',
      roundIndex: 1,
      allocations: [{ assetId: candidate.assetId, weightBps: 10_000, leverage: 1 }],
      cashWeightBps: 0,
      expectedStateVersion: started.stateVersion,
      idempotencyKey: 'v2-portfolio',
    });
    assert.equal(
      submitted.savedResult?.result.contributions?.[0]?.assetName,
      'Synthetic Asset 1-1',
    );
    assert.equal(submitted.savedResult?.result.contributions?.[0]?.assetSymbol, 'SYN11');
  } finally {
    db.close();
  }
});

test('v2 ends the attempt after a zero-wallet liquidation instead of opening another round', () => {
  const dailyId = 'daily-v2-wallet-2026-09-17';
  const base = createSyntheticDailyFiveCasePack(dailyId, undefined, DAILY_FIVE_V2_RULES);
  const pack: DailyFiveCasePack = {
    ...base,
    privateRounds: base.privateRounds.map((round) => ({
      ...round,
      candidates: round.candidates.map((candidate) => ({
        ...candidate,
        candles: [
          candle(
            '2026-09-17T12:00:00.000Z',
            price('1.00000000'),
            price('1.00000000'),
            price('0.50000000'),
            price('0.50000000'),
          ),
        ],
      })),
    })),
  };
  const db = openDatabase(':memory:');
  try {
    const engine = new DailyFiveEngine(db, {
      clock,
      rules: DAILY_FIVE_V2_RULES,
      casePackFor: () => pack,
    });
    const started = engine.start(dailyId, 'zero-wallet-player', { idempotencyKey: 'start' });
    const candidate = started.round!.candidates.find((asset) => asset.assetId === 'daily-1-0')!;
    const saved = engine.submit('zero-wallet-player', started.attemptId, {
      kind: 'portfolio',
      roundIndex: 1,
      allocations: [{ assetId: candidate.assetId, weightBps: 10_000, leverage: 100 }],
      cashWeightBps: 0,
      expectedStateVersion: started.stateVersion,
      idempotencyKey: 'liquidating-portfolio',
    });
    assert.equal(saved.savedResult?.result.endingEquity, '0.00');
    assert.equal(saved.savedResult?.result.liquidated, true);

    const ended = engine.continue('zero-wallet-player', started.attemptId, {
      kind: 'continue',
      roundIndex: 1,
      expectedStateVersion: saved.stateVersion,
      idempotencyKey: 'end-after-liquidation',
    });
    assert.equal(ended.phase, 'final-result');
    assert.equal(ended.finalResult?.endedEarly, true);
    assert.equal(ended.finalResult?.endReason, 'no-funds');
    assert.equal(ended.finalResult?.tickets.length, 1);
  } finally {
    db.close();
  }
});
