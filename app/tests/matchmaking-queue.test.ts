import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { readHuntMatch, readHuntParticipants } from '../server/db/hunt.js';
import { openDatabase } from '../server/db/store.js';
import { registerMatchmakingRoutes } from '../server/matchmaking/routes.js';
import { HuntService } from '../server/services/hunt-service.js';
import type { HuntMatchView } from '../shared/hunt.js';

function clockAt(start = '2026-09-17T12:00:00.000Z') {
  let now = Date.parse(start);
  return {
    clock: () => new Date(now),
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

function ids(prefix: string) {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

test('a lone tracer is matched with a deterministic computer whale after eight seconds', () => {
  const time = clockAt();
  const db = openDatabase(':memory:');
  const service = new HuntService(db, {
    clock: time.clock,
    idFactory: ids('match'),
    botSeedFactory: ids('bot-seed'),
  });
  try {
    const queued = service.enqueue('human-tracer', {
      expectedStateVersion: 1,
      idempotencyKey: 'queue-tracer',
      maxTracers: 1,
      role: 'tracer',
    });
    assert.equal(queued.status, 'queued');
    time.advance(7_999);
    assert.equal(service.status(queued.queueId, 'human-tracer').status, 'queued');
    time.advance(1);
    const matched = service.status(queued.queueId, 'human-tracer');
    assert.equal(matched.status, 'matched');
    assert.ok(matched.matchId);
    const participants = readHuntParticipants(db, matched.matchId);
    assert.deepEqual(
      participants.map((participant) => [participant.role, participant.kind]),
      [
        ['whale', 'computer'],
        ['tracer', 'human'],
      ],
    );
    const tracer = service.getMatch(matched.matchId, 'human-tracer') as HuntMatchView;
    assert.equal(tracer.phase, 'tracer-investigation');
    assert.equal(tracer.viewerRole, 'captain');
    assert.equal(tracer.participants[0]!.computerLabel, 'Computer');
    assert.equal('ownTargets' in tracer, false);
    assert.equal('plans' in tracer, false);
  } finally {
    db.close();
  }
});

test('play computers now starts a locked computer roster and human command retries are idempotent', () => {
  const time = clockAt();
  const db = openDatabase(':memory:');
  const service = new HuntService(db, {
    clock: time.clock,
    idFactory: ids('now'),
    botSeedFactory: ids('bot-seed'),
  });
  try {
    const queued = service.enqueue('human-whale', {
      expectedStateVersion: 1,
      idempotencyKey: 'queue-now',
      maxTracers: 1,
      role: 'whale',
      playComputersNow: true,
    });
    assert.equal(queued.status, 'matched');
    assert.ok(queued.matchId);
    const participants = readHuntParticipants(db, queued.matchId);
    assert.equal(participants.length, 2);
    assert.equal(participants.filter((participant) => participant.kind === 'computer').length, 1);
    const setup = service.getMatch(queued.matchId, 'human-whale') as HuntMatchView;
    assert.equal(setup.phase, 'setup');
    const selected = service.command(queued.matchId, 'human-whale', {
      kind: 'select-targets',
      primaryAssetId: 'hunt-synthetic-asset-1',
      secondaryAssetId: 'hunt-synthetic-asset-2',
      expectedStateVersion: setup.stateVersion,
      idempotencyKey: 'human-targets',
    }) as HuntMatchView;
    assert.equal(selected.phase, 'whale-planning');
    const plan = {
      kind: 'submit-whale-plan' as const,
      roundIndex: 1,
      action: 'burst' as const,
      assetId: 'hunt-synthetic-asset-1',
      units: 4,
      expectedStateVersion: selected.stateVersion,
      idempotencyKey: 'human-plan',
    };
    const first = service.command(queued.matchId, 'human-whale', plan) as HuntMatchView;
    const retry = service.command(queued.matchId, 'human-whale', plan) as HuntMatchView;
    assert.deepEqual(retry, first);
    assert.equal((service.getMatch(queued.matchId, 'human-whale') as HuntMatchView).roundIndex, 2);
    assert.equal(readHuntMatch(db, queued.matchId)?.state_version, 9);
  } finally {
    db.close();
  }
});

test('crew fallback fills every missing tracer seat with labeled computers', () => {
  const time = clockAt();
  const db = openDatabase(':memory:');
  const service = new HuntService(db, {
    clock: time.clock,
    idFactory: ids('crew'),
    botSeedFactory: ids('crew-seed'),
  });
  try {
    const queued = service.enqueue('crew-tracer', {
      expectedStateVersion: 1,
      idempotencyKey: 'crew-queue',
      maxTracers: 5,
      role: 'tracer',
    });
    time.advance(8_000);
    const matched = service.status(queued.queueId, 'crew-tracer');
    assert.equal(matched.status, 'matched');
    assert.ok(matched.matchId);
    const participants = readHuntParticipants(db, matched.matchId);
    assert.equal(participants.filter((participant) => participant.role === 'tracer').length, 5);
    assert.equal(participants.filter((participant) => participant.kind === 'computer').length, 5);
    assert.equal(
      participants.filter(
        (participant) => participant.role === 'tracer' && participant.kind === 'computer',
      ).length,
      4,
    );
    assert.ok(
      participants
        .filter((participant) => participant.kind === 'computer')
        .every((participant) => participant.display_name.includes('Computer')),
    );
  } finally {
    db.close();
  }
});

test('queue status survives a service restart and the API completes without a refresh of the browser page', async () => {
  const time = clockAt();
  const db = openDatabase(':memory:');
  const service = new HuntService(db, { clock: time.clock, idFactory: ids('restart') });
  const app = Fastify({ logger: false });
  let actor = 'restart-player';
  await registerMatchmakingRoutes(app, { engine: service, playerId: () => actor });
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/hunt/queue?role=tracer',
      payload: {
        expectedStateVersion: 1,
        idempotencyKey: 'api-queue',
        maxTracers: 1,
      },
    });
    assert.equal(created.statusCode, 200);
    const entry = created.json<{ queueId: string; status: string }>();
    assert.equal(entry.status, 'queued');
    time.advance(8_000);
    const status = await app.inject({
      url: `/api/hunt/queue/${entry.queueId}`,
    });
    assert.equal(status.statusCode, 200);
    assert.equal(status.json<{ status: string }>().status, 'matched');
    actor = 'other-player';
    const forbidden = await app.inject({ url: `/api/hunt/queue/${entry.queueId}` });
    assert.equal(forbidden.statusCode, 403);
  } finally {
    await app.close();
    db.close();
  }
});

test('queue cancellation is persisted and repeating its key cannot create another membership', () => {
  const db = openDatabase(':memory:');
  const service = new HuntService(db, { idFactory: ids('cancel') });
  try {
    const entry = service.enqueue('cancel-player', {
      expectedStateVersion: 1,
      idempotencyKey: 'cancel-enqueue',
      maxTracers: 1,
      role: 'tracer',
    });
    const command = { expectedStateVersion: 1, idempotencyKey: 'cancel-command' };
    const cancelled = service.cancel(entry.queueId, 'cancel-player', command);
    assert.equal(cancelled.status, 'cancelled');
    assert.deepEqual(service.cancel(entry.queueId, 'cancel-player', command), cancelled);
    const replacement = service.enqueue('cancel-player', {
      expectedStateVersion: 1,
      idempotencyKey: 'replacement-enqueue',
      maxTracers: 1,
      role: 'tracer',
      playComputersNow: true,
    });
    assert.equal(replacement.status, 'matched');
  } finally {
    db.close();
  }
});
