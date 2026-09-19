import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYNTHETIC_DAILY_FINAL_RESULT } from '../fixtures/synthetic/contracts.js';
import {
  ProgressionService,
  calculateUtcStreak,
  PROGRESSION_BADGES,
} from '../server/domain/progression/index.js';
import { readProgressionHuntResults } from '../server/db/progression.js';
import { openDatabase } from '../server/db/store.js';

function dailyInput(
  overrides: Partial<Parameters<ProgressionService['recordDailyResult']>[0]> = {},
) {
  return {
    playerId: 'progress-player',
    attemptId: `attempt-${overrides.dailyId ?? 'one'}-${overrides.mode ?? 'official'}`,
    dailyId: 'daily-2026-09-17',
    mode: 'official' as const,
    completedAt: '2026-09-17T12:00:00.000Z',
    variantId: 'variant-a',
    cohortId: 'cohort-a',
    result: SYNTHETIC_DAILY_FINAL_RESULT,
    ...overrides,
  };
}

function scalarDailyInput(
  overrides: Partial<Parameters<ProgressionService['recordDailyResult']>[0]> = {},
) {
  return {
    playerId: 'progress-player',
    attemptId: `attempt-${overrides.dailyId ?? 'one'}-${overrides.mode ?? 'official'}`,
    dailyId: 'daily-2026-09-17',
    mode: 'official' as const,
    completedAt: '2026-09-17T12:00:00.000Z',
    variantId: 'variant-a',
    cohortId: 'cohort-a',
    equity: '50000.00' as const,
    returnPct: '0.00',
    correctDirections: 5,
    directionalTrades: 5,
    finalized: true as const,
    ...overrides,
  };
}

test('UTC streaks use calendar boundaries and duplicate finalization does not extend them', () => {
  assert.deepEqual(
    calculateUtcStreak(
      ['2026-09-15T23:59:59.000Z', '2026-09-16T00:00:01.000Z', '2026-09-17T00:00:00.000Z'],
      new Date('2026-09-17T23:00:00.000Z'),
    ),
    { currentStreak: 3, bestStreak: 3 },
  );
  assert.deepEqual(
    calculateUtcStreak(['2026-09-15T23:59:59.000Z'], new Date('2026-09-17T00:00:00.000Z')),
    { currentStreak: 0, bestStreak: 1 },
  );

  const db = openDatabase(':memory:');
  const service = new ProgressionService(db, {
    clock: () => new Date('2026-09-17T12:00:00.000Z'),
  });
  service.recordDailyResult(
    dailyInput({ dailyId: 'daily-2026-09-16', completedAt: '2026-09-16T23:59:59Z' }),
  );
  const before = service.view('progress-player');
  const after = service.recordDailyResult(
    dailyInput({ dailyId: 'daily-2026-09-16', completedAt: '2026-09-16T23:59:59Z' }),
  );
  assert.equal(before.dailyHistory.length, 1);
  assert.equal(after.dailyHistory.length, 1);
  assert.equal(
    after.badges.filter((badge) => badge.badgeId === PROGRESSION_BADGES.firstFive).length,
    1,
  );
  db.close();
});

test('daily awards derive from finalized paths and official comparisons exclude practice rows', () => {
  const db = openDatabase(':memory:');
  const service = new ProgressionService(db, {
    clock: () => new Date('2026-09-17T12:00:00.000Z'),
  });
  service.recordDailyResult(scalarDailyInput());
  service.recordDailyResult(
    scalarDailyInput({
      playerId: 'practice-player',
      attemptId: 'practice-attempt',
      mode: 'practice',
      variantId: 'variant-a',
    }),
  );
  const comparison = service.compareDaily({
    playerId: 'progress-player',
    dailyId: 'daily-2026-09-17',
  });
  assert.equal(comparison.eligibleAttempts, 1);
  assert.equal(comparison.rank, 1);
  assert.equal(comparison.percentile, null);
  assert.match(comparison.note, /Official results only/);
  assert.ok(
    service
      .view('progress-player')
      .badges.some((badge) => badge.badgeId === PROGRESSION_BADGES.clearReading),
  );
  db.close();
});

test('ties share rank and percentile appears only at twenty official eligible attempts', () => {
  const db = openDatabase(':memory:');
  const service = new ProgressionService(db, {
    clock: () => new Date('2026-09-17T12:00:00.000Z'),
  });
  service.recordDailyResult(scalarDailyInput());
  service.recordDailyResult(
    scalarDailyInput({
      playerId: 'tie-player',
      attemptId: 'tie-attempt',
      variantId: 'variant-a',
    }),
  );
  assert.equal(
    service.compareDaily({ playerId: 'progress-player', dailyId: 'daily-2026-09-17' }).rank,
    1,
  );
  for (let index = 0; index < 18; index += 1)
    service.recordDailyResult(
      scalarDailyInput({
        playerId: `cohort-player-${index}`,
        attemptId: `cohort-attempt-${index}`,
        variantId: 'variant-a',
        correctDirections: 0,
      }),
    );
  const comparison = service.compareDaily({
    playerId: 'progress-player',
    dailyId: 'daily-2026-09-17',
  });
  assert.equal(comparison.eligibleAttempts, 20);
  assert.equal(comparison.percentile, '95.00');
  db.close();
});

test('hunt history keeps match kinds and role badges separate while retries stay idempotent', () => {
  const db = openDatabase(':memory:');
  const service = new ProgressionService(db, {
    clock: () => new Date('2026-09-17T12:00:00.000Z'),
  });
  service.recordHuntResult({
    playerId: 'progress-player',
    matchId: 'whale-match',
    completedAt: '2026-09-17T10:00:00Z',
    role: 'whale',
    matchKind: 'human',
    maxTracers: 1,
    won: true,
    finalPairCorrect: false,
    finalIncludesDecoy: true,
    finalized: true,
  });
  service.recordHuntResult({
    playerId: 'progress-player',
    matchId: 'tracer-match-1',
    completedAt: '2026-09-17T10:01:00Z',
    role: 'captain',
    matchKind: 'computer',
    maxTracers: 5,
    won: true,
    finalPairCorrect: true,
    correctPairBeforeFinal: true,
    finalized: true,
  });
  for (let index = 2; index <= 3; index += 1)
    service.recordHuntResult({
      playerId: 'progress-player',
      matchId: `tracer-match-${index}`,
      completedAt: `2026-09-17T10:0${index}:00Z`,
      role: 'tracer',
      matchKind: index === 2 ? 'substituted' : 'human',
      maxTracers: 5,
      won: true,
      finalPairCorrect: true,
      correctPairBeforeFinal: true,
      finalized: true,
    });
  service.recordHuntResult({
    playerId: 'progress-player',
    matchId: 'tracer-match-1',
    completedAt: '2026-09-17T10:01:00Z',
    role: 'captain',
    matchKind: 'computer',
    maxTracers: 5,
    won: true,
    finalPairCorrect: true,
    correctPairBeforeFinal: true,
    finalized: true,
  });
  const view = service.view('progress-player');
  assert.ok(view.badges.some((badge) => badge.badgeId === PROGRESSION_BADGES.quietCurrent));
  assert.ok(view.badges.some((badge) => badge.badgeId === PROGRESSION_BADGES.falseWake));
  assert.ok(view.badges.some((badge) => badge.badgeId === PROGRESSION_BADGES.firstContact));
  assert.ok(view.badges.some((badge) => badge.badgeId === PROGRESSION_BADGES.patternReader));
  assert.ok(view.badges.some((badge) => badge.badgeId === PROGRESSION_BADGES.bothSides));
  assert.equal(view.huntHistory.length, 4);
  assert.deepEqual(
    readProgressionHuntResults(db, 'progress-player')
      .map((row) => row.match_kind)
      .sort(),
    ['computer', 'human', 'human', 'substituted'],
  );
  db.close();
});
