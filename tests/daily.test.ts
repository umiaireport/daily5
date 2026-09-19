import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/db/store.js';
import {
  acquireDailyLease,
  dailySettlementSources,
  initializeDailyDatabase,
  pendingDailyChallenges,
  registerDailySettlementSources,
  releaseDailyLease,
} from '../server/db/daily.js';
import { DailyGame, type DailyChallenge, type DailySettlement } from '../server/domain/daily.js';
import { Game } from '../server/domain/game.js';

const challenge: DailyChallenge = {
  id: 'daily-test-2026-09-16',
  version: 'daily-v1',
  evidenceVersion: 'evidence-v1',
  assetIds: ['a', 'b', 'c'],
  evidence: {
    source: 'synthetic-test-only',
    observedAt: '2026-09-16T11:59:59.000Z',
    cards: [{ direction: 'in', warning: 'Incomplete coverage' }],
  },
  rules: { version: 'costs-v1', startCash: 10_000, entryCostBps: 30, exitCostBps: 30 },
  opensAt: '2026-09-16T12:00:00.000Z',
  locksAt: '2026-09-16T12:10:00.000Z',
  entryAt: '2026-09-16T13:00:00.000Z',
  settleAt: '2026-09-17T13:00:00.000Z',
  voidAt: '2026-09-18T13:00:00.000Z',
};
const settlement: DailySettlement = {
  version: 'settlement-v1',
  prices: [
    { assetId: 'a', entry: 2, exit: 3 },
    { assetId: 'b', entry: 5, exit: 4 },
    { assetId: 'c', entry: 1, exit: 1 },
  ],
};

function setup(path = ':memory:') {
  const db = openDatabase(path);
  initializeDailyDatabase(db);
  let now = new Date(challenge.opensAt);
  const daily = new DailyGame(db, () => now);
  const session = new Game(db).createSession();
  daily.publish(challenge);
  return {
    db,
    daily,
    session,
    at: (timestamp: string) => {
      now = new Date(timestamp);
    },
  };
}

test('daily publication pins evidence and rules without exposing settlement outcomes', (t) => {
  const { db, daily } = setup();
  t.after(() => db.close());
  assert.deepEqual(
    daily.publish({
      ...challenge,
      evidence: {
        cards: [{ warning: 'Incomplete coverage', direction: 'in' }],
        observedAt: '2026-09-16T11:59:59.000Z',
        source: 'synthetic-test-only',
      },
    }),
    challenge,
  );
  assert.throws(() => daily.publish({ ...challenge, evidenceVersion: 'revised' }), /immutable/);
  assert.throws(
    () =>
      daily.publish({
        ...challenge,
        id: 'unsupported-rules',
        rules: { ...challenge.rules, version: 'costs-v2' },
      }),
    /unsupported scoring/,
  );
  assert.throws(
    () => daily.publish({ ...challenge, id: 'malformed-rules', rules: null as never }),
    /unsupported scoring/,
  );
  assert.throws(
    () => daily.publish({ ...challenge, id: 'bad-window', settleAt: challenge.entryAt }),
    /24-hour/,
  );
  assert.throws(
    () => daily.publish({ ...challenge, id: 'bad-evidence', evidence: NaN }),
    /finite JSON/,
  );
  const publicPayload = daily.challenge(challenge.id);
  assert.deepEqual(publicPayload, challenge);
  assert.equal(JSON.stringify(publicPayload).includes('prices'), false);
  publicPayload.assetIds[0] = 'mutated';
  assert.equal(daily.challenge(challenge.id).assetIds[0], 'a');
});

test('private settlement sources survive restart and cannot revise a published challenge', (t) => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'whale-sources-')), 'game.sqlite');
  const first = setup(databasePath);
  t.after(() => first.db.close());
  const sources = [
    {
      assetId: 'a',
      kind: 'synthetic' as const,
      chain: null,
      tokenAddress: null,
      entryPrice: 2,
      fallbackExitPrice: 3,
    },
    {
      assetId: 'b',
      kind: 'nansen' as const,
      chain: 'ethereum',
      tokenAddress: '0x0000000000000000000000000000000000000001',
      entryPrice: 5,
      fallbackExitPrice: null,
    },
    {
      assetId: 'c',
      kind: 'synthetic' as const,
      chain: null,
      tokenAddress: null,
      entryPrice: 1,
      fallbackExitPrice: 1,
    },
  ];
  registerDailySettlementSources(first.db, challenge.id, sources);
  assert.deepEqual(
    dailySettlementSources(first.db, challenge.id),
    sources.map((source) => ({ ...source, challengeId: challenge.id })),
  );
  const pending = pendingDailyChallenges(first.db);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.id, challenge.id);
  assert.deepEqual(JSON.parse(pending[0]!.payload), challenge);
  assert.deepEqual(first.daily.challenge(challenge.id), challenge);
  assert.throws(
    () =>
      registerDailySettlementSources(first.db, challenge.id, [
        ...sources.slice(0, 2),
        { ...sources[2]!, entryPrice: 9 },
      ]),
    /immutable/,
  );
  const resumed = openDatabase(databasePath);
  t.after(() => resumed.close());
  initializeDailyDatabase(resumed);
  assert.deepEqual(
    dailySettlementSources(resumed, challenge.id),
    [...sources.slice(0, 2), sources[2]].map((source) => ({
      ...source,
      challengeId: challenge.id,
    })),
  );
});

test('one daily entry locks inside the exact server window and retries remain idempotent after close', (t) => {
  const { db, daily, session, at } = setup();
  t.after(() => db.close());
  at('2026-09-16T11:59:59.999Z');
  assert.throws(() => daily.enter(session.id, challenge.id, [0, 0, 0, 100]), /open window/);
  at(challenge.opensAt);
  assert.throws(() => daily.enter(session.id, challenge.id, [33, 33, 34, 0]), /10% steps/);
  assert.throws(
    () => daily.enter('unknown-session', challenge.id, [0, 0, 0, 100]),
    /valid anonymous session/,
  );
  const first = daily.enter(session.id, challenge.id, [40, 20, 10, 30]);
  assert.equal(first.status, 'pending');
  assert.throws(() => daily.enter(session.id, challenge.id, [100, 0, 0, 0]), /already locked/);
  at(challenge.locksAt);
  assert.deepEqual(daily.enter(session.id, challenge.id, [40, 20, 10, 30]), first);
  const other = new Game(db).createSession();
  assert.throws(() => daily.enter(other.id, challenge.id, [0, 0, 0, 100]), /open window/);
  assert.throws(() => daily.result(other.id, challenge.id), /No official entry/);
  assert.throws(
    () => daily.publish({ ...challenge, id: 'late-publication' }),
    /after choices close/,
  );
});

test('completed outcomes settle only after 24 hours and freeze score, cost and settlement versions', (t) => {
  const { db, daily, session, at } = setup();
  t.after(() => db.close());
  daily.enter(session.id, challenge.id, [100, 0, 0, 0]);
  at('2026-09-17T12:59:59.999Z');
  assert.throws(() => daily.settle(challenge.id, settlement), /not complete/);
  assert.deepEqual(daily.result(session.id, challenge.id), {
    status: 'pending',
    challengeId: challenge.id,
    weights: [100, 0, 0, 0],
  });
  at(challenge.settleAt);
  assert.equal(daily.settle(challenge.id, settlement), 'settled');
  const result = daily.result(session.id, challenge.id);
  assert.equal(result.status, 'settled');
  if (result.status !== 'settled') return assert.fail('Expected settled result');
  assert.ok(Math.abs(result.endEquity - (10_000 * 1.5 * 0.997) / 1.003) < 1e-8);
  assert.ok(
    Math.abs(result.benchmarkPct - ((((1.5 + 0.8 + 1) / 3) * 0.997) / 1.003 - 1) * 100) < 1e-8,
  );
  assert.equal(result.settlementVersion, 'settlement-v1');
  assert.equal(result.costVersion, 'costs-v1');
  assert.equal(daily.settle(challenge.id, settlement), 'settled');
  assert.throws(
    () => daily.settle(challenge.id, { ...settlement, version: 'settlement-v2' }),
    /cannot be revised/,
  );
  assert.deepEqual(daily.result(session.id, challenge.id), result);
  assert.deepEqual(daily.challenge(challenge.id), challenge);
});

test('missing prices stay pending and become irrevocably void at the fixed deadline', (t) => {
  const { db, daily, session, at } = setup();
  t.after(() => db.close());
  daily.enter(session.id, challenge.id, [0, 0, 0, 100]);
  at(challenge.settleAt);
  assert.equal(daily.settle(challenge.id, null), 'pending');
  assert.equal(
    daily.settle(challenge.id, {
      ...settlement,
      prices: settlement.prices.map((price, i) => ({
        ...price,
        exit: i === 2 ? null : price.exit,
      })),
    }),
    'pending',
  );
  assert.equal(daily.result(session.id, challenge.id).status, 'pending');
  for (const exit of [0, -1, Infinity, NaN])
    assert.throws(
      () =>
        daily.settle(challenge.id, {
          ...settlement,
          prices: settlement.prices.map((price) => ({ ...price, exit })),
        }),
      /finite and positive/,
    );
  assert.throws(
    () => daily.settle(challenge.id, { ...settlement, prices: [...settlement.prices].reverse() }),
    /published asset order/,
  );
  at(challenge.voidAt);
  assert.equal(daily.settle(challenge.id, settlement), 'void');
  assert.equal(daily.settle(challenge.id, null), 'void');
  assert.equal(daily.result(session.id, challenge.id).status, 'void');
  assert.throws(() => daily.settle(challenge.id, settlement), /cannot be revised/);
});

test('settlement and official entry survive restart without duplicating or changing results', (t) => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'whale-daily-')), 'game.sqlite');
  const first = setup(databasePath);
  first.daily.enter(first.session.id, challenge.id, [30, 20, 10, 40]);
  first.db.close();
  const db = openDatabase(databasePath);
  t.after(() => db.close());
  initializeDailyDatabase(db);
  const resumed = new DailyGame(db, () => new Date(challenge.settleAt));
  assert.equal(resumed.result(first.session.id, challenge.id).status, 'pending');
  resumed.settle(challenge.id, settlement);
  const expected = resumed.result(first.session.id, challenge.id);
  const concurrent = openDatabase(databasePath);
  t.after(() => concurrent.close());
  initializeDailyDatabase(concurrent);
  const otherWorker = new DailyGame(concurrent, () => new Date(challenge.voidAt));
  assert.equal(otherWorker.settle(challenge.id, settlement), 'settled');
  assert.deepEqual(otherWorker.enter(first.session.id, challenge.id, [30, 20, 10, 40]), expected);
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM daily_entries').get() as { count: number }).count,
    1,
  );
});

test('SQLite leases exclude a second worker, renew, expire and release only for their owner', (t) => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'whale-leases-')), 'game.sqlite');
  const { db } = setup(databasePath);
  t.after(() => db.close());
  const other = openDatabase(databasePath);
  t.after(() => other.close());
  const at = (ms: number) => new Date(Date.parse(challenge.settleAt) + ms);
  assert.equal(acquireDailyLease(db, 'daily-settle', 'worker-a', 1000, at(0)), true);
  assert.equal(acquireDailyLease(other, 'daily-settle', 'worker-b', 1000, at(0)), false);
  assert.equal(acquireDailyLease(db, 'daily-settle', 'worker-a', 1000, at(500)), true);
  assert.equal(acquireDailyLease(other, 'daily-settle', 'worker-b', 1000, at(1000)), false);
  assert.equal(releaseDailyLease(other, 'daily-settle', 'worker-b'), false);
  assert.equal(acquireDailyLease(other, 'daily-settle', 'worker-b', 1000, at(1500)), true);
  assert.equal(releaseDailyLease(db, 'daily-settle', 'worker-a'), false);
  assert.equal(releaseDailyLease(other, 'daily-settle', 'worker-b'), true);
  assert.throws(
    () => acquireDailyLease(db, 'daily-settle', 'worker-a', 0, at(0)),
    /positive duration/,
  );
});
