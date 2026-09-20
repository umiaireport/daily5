import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPreDecisionPoint } from '../shared/evidence.js';
import {
  DAILY_FIVE_RULES,
  FIXED_POINT,
  HUNT_RULES,
  money,
  moneyFromCents,
  parseMoney,
  parsePrice,
  priceFromUnits,
  roundQuotient,
} from '../shared/game-rules.js';
import { HUNT_ROUTES } from '../shared/hunt.js';
import { canShowPercentile } from '../shared/progression.js';
import {
  SYNTHETIC_DAILY_FIVE,
  SYNTHETIC_DAILY_FINAL_RESULT,
  SYNTHETIC_DAILY_SAVED_RESULT,
  SYNTHETIC_DAILY_DECISIONS,
  SYNTHETIC_HUNT_COMMANDS,
  SYNTHETIC_HUNT_COMPLETE_LIFECYCLE,
  SYNTHETIC_HUNT_REVEAL,
  SYNTHETIC_HUNT_TRACER_VIEW,
  SYNTHETIC_HUNT_WHALE_VIEW,
  SYNTHETIC_INVALID_COMMANDS,
  SYNTHETIC_REFRESH_RECOVERY,
  SYNTHETIC_TIMEOUT,
  SYNTHETIC_UNAVAILABLE_DATA,
} from '../fixtures/synthetic/contracts.js';

test('fixed-point contracts use exact scales and centralized tie rounding', () => {
  assert.equal(FIXED_POINT.money.scale, 2);
  assert.equal(FIXED_POINT.price.scale, 8);
  assert.equal(parseMoney('-12.34'), -1234n);
  assert.equal(parsePrice('1.25000000'), 125000000n);
  assert.equal(moneyFromCents(5000000n), '50000.00');
  assert.equal(priceFromUnits(125000000n), '1.25000000');
  assert.equal(roundQuotient(5n, 2n), 3n);
  assert.equal(roundQuotient(-5n, 2n), -3n);
  assert.throws(() => money('50000'), /exactly 2 decimal places/);
  assert.throws(() => roundQuotient(1n, 0n), /positive denominator/);
});

test('pre-decision evidence compares parsed instants and rejects invalid cutoffs', () => {
  const point = { at: '2026-09-01T16:30:00-01:00', value: priceFromUnits(1n) };
  assert.equal(isPreDecisionPoint(point, '2026-09-01T17:00:00Z'), false);
  assert.equal(isPreDecisionPoint(point, 'not-a-timestamp'), false);
  assert.equal(
    isPreDecisionPoint({ ...point, at: '2026-09-01T16:30:00Z' }, '2026-09-01T17:00:00Z'),
    true,
  );
});

test('daily fixture freezes five rounds, five candidates, and the required defaults', () => {
  assert.equal(SYNTHETIC_DAILY_FIVE.rounds.length, DAILY_FIVE_RULES.totalRounds);
  assert.deepEqual(
    SYNTHETIC_DAILY_FIVE.rounds.map((round) => round.candidates.length),
    [5, 5, 5, 5, 5],
  );
  assert.equal(DAILY_FIVE_RULES.startingCapital, '50000.00');
  assert.equal(DAILY_FIVE_RULES.roundStake, '10000.00');
  assert.equal(DAILY_FIVE_RULES.clueUnlocksPerRound, 3);
  assert.equal(DAILY_FIVE_RULES.minLeverage, 1);
  assert.equal(DAILY_FIVE_RULES.maxLeverage, 100);
  assert.equal(DAILY_FIVE_RULES.historicalLookbackHours, 6);
  assert.equal(DAILY_FIVE_RULES.outcomeWindowHours, 1);
  assert.equal(DAILY_FIVE_RULES.candleIntervalMinutes, 5);
  assert.equal(DAILY_FIVE_RULES.dailyReset, '00:00Z');
  for (const round of SYNTHETIC_DAILY_FIVE.rounds) {
    for (const candidate of round.candidates) {
      assert.ok(candidate.chart.every((point) => isPreDecisionPoint(point, round.cutoffAt)));
      assert.equal(candidate.clueDescriptors.length, 6);
      assert.equal(candidate.unlockedClues.length, 0);
      for (const descriptor of candidate.clueDescriptors)
        assert.equal('factualHeadline' in descriptor, false);
    }
  }
  const descriptors = SYNTHETIC_DAILY_FIVE.rounds.flatMap((round) =>
    round.candidates.flatMap((candidate) => candidate.clueDescriptors),
  );
  assert.equal(
    new Set(descriptors.map((descriptor) => descriptor.clueId)).size,
    descriptors.length,
  );
  assert.deepEqual(Object.keys(descriptors[0]!).sort(), [
    'category',
    'clueId',
    'question',
    'title',
  ]);
});

test('daily lifecycle fixtures cover submission, saved-result refresh recovery, and final result', () => {
  assert.equal(SYNTHETIC_DAILY_DECISIONS.length, 5);
  assert.equal(SYNTHETIC_DAILY_SAVED_RESULT.phase, 'saved-result');
  assert.deepEqual(
    SYNTHETIC_REFRESH_RECOVERY.beforeRefresh,
    SYNTHETIC_REFRESH_RECOVERY.afterRefresh,
  );
  assert.equal(SYNTHETIC_REFRESH_RECOVERY.requiredAction, 'continue');
  assert.equal(SYNTHETIC_DAILY_FINAL_RESULT.phase, 'final-result');
  assert.equal(SYNTHETIC_DAILY_FINAL_RESULT.tickets.length, 5);
  assert.equal(SYNTHETIC_DAILY_FINAL_RESULT.totalEquity, '49960.00');
  assert.equal(SYNTHETIC_DAILY_FINAL_RESULT.cohort, 'synthetic-case-pack-v1');
});

test('hunt fixtures expose role-filtered views and the complete command boundary', () => {
  assert.equal(SYNTHETIC_HUNT_WHALE_VIEW.assets.length, HUNT_RULES.assets);
  assert.ok(SYNTHETIC_HUNT_WHALE_VIEW.ownTargets);
  assert.equal('ownTargets' in SYNTHETIC_HUNT_TRACER_VIEW, false);
  assert.equal('unitsPurchased' in SYNTHETIC_HUNT_TRACER_VIEW, false);
  assert.equal(SYNTHETIC_HUNT_TRACER_VIEW.participants[1]?.computerLabel, 'Computer');
  assert.equal(SYNTHETIC_HUNT_TRACER_VIEW.participants[1]?.role, 'tracer');
  assert.equal(SYNTHETIC_HUNT_TRACER_VIEW.captain.transfer, 'stable');
  assert.equal(SYNTHETIC_HUNT_TRACER_VIEW.captain.canSubmitFinalAccusation, true);
  assert.equal(SYNTHETIC_HUNT_COMMANDS.length, 7);
  assert.equal(SYNTHETIC_HUNT_REVEAL.winner, 'tracers');
  assert.equal(SYNTHETIC_HUNT_REVEAL.reason, 'targets-identified');
  assert.equal(
    SYNTHETIC_HUNT_COMPLETE_LIFECYCLE.filter((phase) => phase === 'round-complete').length,
    5,
  );
  assert.equal(SYNTHETIC_HUNT_COMPLETE_LIFECYCLE.at(-1), 'finished');
  assert.equal(HUNT_ROUTES.queueEnqueue, 'POST /api/hunt/queue');
  assert.equal(HUNT_ROUTES.queueStatus, 'GET /api/hunt/queue/:id');
  assert.equal(HUNT_ROUTES.queueCancel, 'DELETE /api/hunt/queue/:id');
});

test('unavailable data, invalid commands, and timeout remain explicit fixture states', () => {
  assert.equal(SYNTHETIC_UNAVAILABLE_DATA.status, 'unavailable');
  assert.equal(SYNTHETIC_UNAVAILABLE_DATA.reasonCode, 'incomplete-window');
  assert.deepEqual(
    SYNTHETIC_INVALID_COMMANDS.map((item) => item.code),
    ['STALE_STATE', 'IDEMPOTENCY_CONFLICT', 'INVALID_PHASE'],
  );
  assert.equal(SYNTHETIC_TIMEOUT.phase, 'voided');
  assert.equal(SYNTHETIC_TIMEOUT.code, 'TIMEOUT');
});

test('percentiles stay hidden until the twenty-attempt cohort threshold', () => {
  assert.equal(canShowPercentile(19), false);
  assert.equal(canShowPercentile(20), true);
});
