import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPlan,
  createEventRecord,
  createSyntheticHuntBoard,
  resolveScan,
} from '../server/domain/hunt/index.js';
import type { HuntPlanRecord } from '../server/domain/hunt/types.js';

const board = createSyntheticHuntBoard('evidence-test-board');
const firstAsset = board.assets[0]!.caseId;
const secondAsset = board.assets[1]!.caseId;

function plan(
  roundIndex: number,
  action: HuntPlanRecord['action'],
  assetId: string | null,
  units: number,
): HuntPlanRecord {
  return { roundIndex, action, assetId, units };
}

test('event records combine deterministic historical and simulated activity without changing the board', () => {
  const empty = createEventRecord(board);
  const burst = applyPlan(empty, plan(1, 'burst', firstAsset, 3));
  const drip = applyPlan(burst, plan(2, 'drip', secondAsset, 2));
  const blend = applyPlan(drip, plan(3, 'blend', firstAsset, 1));
  assert.equal(empty.simulated.length, 0);
  assert.equal(blend.simulated.length, 4);
  assert.equal(blend.events.length, blend.historical.length + blend.simulated.length);
  assert.deepEqual(blend.board, board);
  assert.ok(blend.simulated.every((event) => event.source === 'simulated' && event.side === 'buy'));
  assert.deepEqual(
    blend.events.map((event) => event.eventId),
    [...blend.events]
      .sort(
        (left, right) =>
          left.at.localeCompare(right.at) || left.eventId.localeCompare(right.eventId),
      )
      .map((event) => event.eventId),
  );
});

test('scans are reproducible, bounded to the event record, and preserve unavailable baselines', () => {
  const scanId = board.publicAssets[0]!.clueDescriptors.find(
    (clue) => clue.category === 'flow',
  )!.clueId;
  const first = resolveScan(createEventRecord(board), { roundIndex: 1, scanId });
  const replay = resolveScan(createEventRecord(board), { roundIndex: 1, scanId });
  assert.deepEqual(replay, first);
  assert.equal(first.sourceKind, 'synthetic');
  assert.equal(first.evidenceCutoff, board.cutoffAt);
  assert.equal(first.metrics[0]!.label, 'Net observed flow');
  assert.ok(first.interpretation.includes('simulated purchases'));
  assert.ok(first.factualHeadline.includes('Buying') || first.factualHeadline.includes('Selling'));

  const withPurchase = applyPlan(createEventRecord(board), plan(1, 'burst', firstAsset, 2));
  const positionId = board.publicAssets[0]!.clueDescriptors.find(
    (clue) => clue.category === 'absorption',
  )!.clueId;
  const position = resolveScan(withPurchase, { roundIndex: 1, scanId: positionId });
  assert.equal(position.metrics[0]!.value, '2');
  const timingId = board.publicAssets[0]!.clueDescriptors.find(
    (clue) => clue.category === 'volatility',
  )!.clueId;
  const timing = resolveScan(createEventRecord(board), { roundIndex: 1, scanId: timingId });
  assert.equal(timing.metrics[0]!.value, 'Unavailable');
  assert.ok(timing.limitation?.includes('baseline'));
  assert.equal(JSON.stringify(position).includes('primaryAssetId'), false);
});
