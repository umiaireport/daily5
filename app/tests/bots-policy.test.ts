import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readHuntParticipants } from '../server/db/hunt.js';
import { openDatabase } from '../server/db/store.js';
import {
  chooseTracerFinalAccusation,
  chooseTracerScan,
  chooseTracerSuspicion,
  chooseWhalePlan,
  chooseWhaleTargets,
  sanitizeTracerObservation,
  sanitizeWhaleObservation,
} from '../server/bots/index.js';
import { HuntService } from '../server/services/hunt-service.js';
import type { HuntMatchView } from '../shared/hunt.js';

function ids(prefix: string) {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

test('identical seeds and sanitized observations reproduce whale and tracer decisions', () => {
  let now = Date.parse('2026-09-17T12:00:00.000Z');
  const db = openDatabase(':memory:');
  const service = new HuntService(db, {
    clock: () => new Date(now),
    idFactory: ids('policy'),
    botSeedFactory: ids('bot'),
  });
  try {
    const entry = service.enqueue('policy-tracer', {
      expectedStateVersion: 1,
      idempotencyKey: 'policy-queue',
      maxTracers: 1,
      role: 'tracer',
      playComputersNow: true,
    });
    assert.ok(entry.matchId);
    const participants = readHuntParticipants(db, entry.matchId);
    const botWhale = participants.find((participant) => participant.role === 'whale')!;
    const whaleView = service.getMatch(entry.matchId, botWhale.participant_id) as HuntMatchView;
    const whaleA = sanitizeWhaleObservation(whaleView, 'same-seed', {
      primaryUnits: 0,
      secondaryUnits: 0,
      decoyUnits: 0,
      decisionIndex: 0,
    });
    const whaleB = sanitizeWhaleObservation(whaleView, 'same-seed', {
      primaryUnits: 0,
      secondaryUnits: 0,
      decoyUnits: 0,
      decisionIndex: 0,
    });
    assert.deepEqual(chooseWhaleTargets(whaleA), chooseWhaleTargets(whaleB));
    assert.deepEqual(chooseWhalePlan(whaleA), chooseWhalePlan(whaleB));

    const tracerView = service.getMatch(entry.matchId, 'policy-tracer') as HuntMatchView;
    const tracerA = sanitizeTracerObservation(tracerView, 'same-seed', 'skeptic', 0);
    const tracerB = sanitizeTracerObservation(tracerView, 'same-seed', 'skeptic', 0);
    assert.deepEqual(chooseTracerScan(tracerA), chooseTracerScan(tracerB));
    assert.deepEqual(chooseTracerSuspicion(tracerA), chooseTracerSuspicion(tracerB));
    assert.deepEqual(chooseTracerFinalAccusation(tracerA), chooseTracerFinalAccusation(tracerB));
    assert.equal('ownTargets' in tracerA, false);
    assert.equal('plans' in tracerA, false);
    assert.equal('targets' in tracerA, false);
  } finally {
    db.close();
  }
  now += 1;
});
