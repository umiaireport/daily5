import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HuntRuleError,
  HUNT_ENGINE_RULES,
  resolveFinal,
  scoreMatch,
  validateWhalePlan,
} from '../server/domain/hunt/index.js';
import type {
  HuntPlanRecord,
  HuntPurchaseRecord,
  HuntSuspicionRecord,
  HuntTargetPair,
} from '../server/domain/hunt/types.js';
import type { SubmitWhalePlanCommand } from '../shared/hunt.js';

const assets = ['asset-a', 'asset-b', 'asset-c', 'asset-d', 'asset-e', 'asset-f'];
const targets: HuntTargetPair = { primaryAssetId: 'asset-a', secondaryAssetId: 'asset-b' };

test('Hunt phase clocks stay within the one-minute action limit', () => {
  assert.ok(HUNT_ENGINE_RULES.setupDurationMs <= 60_000);
  assert.ok(HUNT_ENGINE_RULES.whalePlanningDurationMs <= 60_000);
  assert.ok(HUNT_ENGINE_RULES.tracerInvestigationDurationMs <= 60_000);
  assert.ok(HUNT_ENGINE_RULES.finalAccusationDurationMs <= 60_000);
});

function command(
  roundIndex: number,
  action: SubmitWhalePlanCommand['action'],
  units: number,
  assetId?: string,
): SubmitWhalePlanCommand {
  return {
    kind: 'submit-whale-plan',
    roundIndex,
    action,
    units,
    ...(assetId === undefined ? {} : { assetId }),
    expectedStateVersion: roundIndex,
    idempotencyKey: `plan-${roundIndex}`,
  };
}

function purchase(assetId: string, units: number, eventId: string): HuntPurchaseRecord {
  return {
    eventId,
    roundIndex: 1,
    assetId,
    at: '2026-09-17T12:00:00.000Z',
    side: 'buy',
    units,
    valueUsd: units * 1_000,
    source: 'simulated',
    action: 'burst',
  };
}

function suspicion(
  actorId: string,
  primaryAssetId: string,
  secondaryAssetId: string,
): HuntSuspicionRecord {
  return { actorId, roundIndex: 1, primaryAssetId, secondaryAssetId };
}

test('whale plans enforce target locations, per-round limits, decoys, and future objective capacity', () => {
  assert.throws(
    () =>
      validateWhalePlan({
        command: command(1, 'burst', 1, 'asset-a'),
        targets: { ...targets, primaryAssetId: 'missing' },
        assets,
        priorPlans: [],
      }),
    (error: unknown) => error instanceof HuntRuleError && error.code === 'INVALID_TARGETS',
  );
  assert.throws(
    () => validateWhalePlan({ command: command(3, 'wait', 0), targets, assets, priorPlans: [] }),
    /too few future rounds/,
  );
  assert.throws(
    () =>
      validateWhalePlan({
        command: command(1, 'burst', 5, 'asset-a'),
        targets,
        assets,
        priorPlans: [],
      }),
    /zero to four/,
  );
  assert.throws(
    () =>
      validateWhalePlan({
        command: command(1, 'decoy', 3, 'asset-c'),
        targets,
        assets,
        priorPlans: [],
      }),
    /at most two/,
  );
  const first = validateWhalePlan({
    command: command(1, 'burst', 4, 'asset-a'),
    targets,
    assets,
    priorPlans: [],
  });
  const second = validateWhalePlan({
    command: command(2, 'drip', 4, 'asset-a'),
    targets,
    assets,
    priorPlans: [first],
  });
  assert.equal(second.units, 4);
  assert.throws(
    () =>
      validateWhalePlan({ command: command(1, 'wait', 0), targets, assets, priorPlans: [first] }),
    /already has a whale plan/,
  );
});

test('scoring gives partial completion to the whale while incomplete objectives still lose', () => {
  const partial = scoreMatch({
    targets,
    purchases: [purchase('asset-a', 4, 'one'), purchase('asset-b', 2, 'two')],
    suspicions: [suspicion('tracer', 'asset-a', 'asset-c')],
    accusation: { primaryAssetId: 'asset-c', secondaryAssetId: 'asset-d' },
  });
  assert.equal(partial.primaryUnits, 4);
  assert.equal(partial.secondaryUnits, 2);
  assert.equal(partial.objectiveComplete, false);
  assert.equal(partial.whaleCompletion, 200);
  assert.equal(partial.whaleEscape, 0);
  assert.equal(partial.winner, 'tracers');
  assert.equal(partial.tracerScore, 40);
});

test('completed objective escapes only when the final pair is wrong and duplicate final IDs are rejected', () => {
  const complete = resolveFinal({
    targets,
    purchases: [purchase('asset-a', 8, 'one'), purchase('asset-b', 4, 'two')],
    suspicions: [suspicion('tracer', 'asset-a', 'asset-b')],
    accusation: { primaryAssetId: 'asset-c', secondaryAssetId: 'asset-d' },
  });
  assert.equal(complete.scores.objectiveComplete, true);
  assert.equal(complete.scores.whaleScore, 1_000);
  assert.equal(complete.scores.winner, 'whale');
  assert.equal(complete.scores.tracerScore, 80);
  assert.throws(
    () =>
      resolveFinal({
        targets,
        purchases: [],
        accusation: { primaryAssetId: 'asset-c', secondaryAssetId: 'asset-c' },
      }),
    /two distinct/,
  );
});
