import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db/store.js';
import { HuntService } from '../server/services/hunt-service.js';
import type { HuntMatchView, HuntTracerView, HuntReveal } from '../shared/hunt.js';

test('a deterministic computer whale stays legal through all five synthetic rounds', () => {
  let now = Date.parse('2026-09-17T12:00:00.000Z');
  let id = 0;
  const db = openDatabase(':memory:');
  const service = new HuntService(db, {
    clock: () => new Date(now),
    idFactory: () => `bot-journey-${++id}`,
    botSeedFactory: () => `independent-seed-${++id}`,
  });
  try {
    const entry = service.enqueue('human-tracer', {
      expectedStateVersion: 1,
      idempotencyKey: 'bot-journey-queue',
      maxTracers: 1,
      role: 'tracer',
      playComputersNow: true,
    });
    assert.ok(entry.matchId);
    for (let roundIndex = 1; roundIndex <= 5; roundIndex += 1) {
      const initial = service.getMatch(entry.matchId, 'human-tracer');
      assert.ok(initial.viewerRole !== 'whale');
      let view: HuntTracerView = initial;
      assert.equal(view.phase, 'tracer-investigation');
      while (view.scansRemaining > 0) {
        const scanId = view.assets[0]!.clueDescriptors[3 - view.scansRemaining]!.clueId;
        view = service.command(entry.matchId, 'human-tracer', {
          kind: 'purchase-scan',
          roundIndex,
          scanId,
          expectedStateVersion: view.stateVersion,
          idempotencyKey: `human-scan-${roundIndex}-${view.scansRemaining}`,
        }) as HuntTracerView;
      }
      view = service.command(entry.matchId, 'human-tracer', {
        kind: 'submit-suspicion',
        roundIndex,
        primaryAssetId: 'hunt-synthetic-asset-1',
        secondaryAssetId: 'hunt-synthetic-asset-2',
        expectedStateVersion: view.stateVersion,
        idempotencyKey: `human-suspicion-${roundIndex}`,
      }) as HuntTracerView;
      view = service.command(entry.matchId, 'human-tracer', {
        kind: 'finish-investigation',
        roundIndex,
        expectedStateVersion: view.stateVersion,
        idempotencyKey: `human-finish-${roundIndex}`,
      }) as HuntTracerView;
      assert.equal(view.phase, roundIndex === 5 ? 'final-accusation' : 'whale-planning');
    }
    const finalView = service.getMatch(entry.matchId, 'human-tracer') as HuntMatchView;
    const reveal = service.command(entry.matchId, 'human-tracer', {
      kind: 'final-accusation',
      primaryAssetId: 'hunt-synthetic-asset-3',
      secondaryAssetId: 'hunt-synthetic-asset-4',
      expectedStateVersion: finalView.stateVersion,
      idempotencyKey: 'human-final',
    }) as HuntReveal;
    assert.ok(['objective-complete', 'targets-identified'].includes(reveal.reason));
    const reconstruction = service.engine.reconstruction(entry.matchId, 'human-tracer');
    assert.equal(reconstruction.plans.length, 5);
    assert.equal(reconstruction.scores?.objectiveComplete, true);
  } finally {
    db.close();
  }
});
