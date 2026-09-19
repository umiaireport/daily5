import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { readHuntRoom } from '../server/db/hunt.js';
import { openDatabase } from '../server/db/store.js';
import { HuntEngine } from '../server/domain/hunt/index.js';
import { registerHuntRoutes } from '../server/routes/hunt.js';

test('Hunt route registrar keeps private role views and structured command errors', async (t) => {
  const db = openDatabase(':memory:');
  const engine = new HuntEngine(db, { clock: () => new Date('2026-09-17T12:00:00.000Z') });
  let actor = 'api-whale';
  const app = Fastify({ logger: false });
  await registerHuntRoutes(app, { engine, playerId: () => actor });
  t.after(async () => {
    await app.close();
    db.close();
  });

  const created = await app.inject({
    method: 'POST',
    url: '/api/hunt/rooms',
    payload: { maxTracers: 1, idempotencyKey: 'create-room' },
  });
  assert.equal(created.statusCode, 200);
  const room = created.json<{ roomCode: string; participants: { role: string }[] }>();
  assert.equal(room.participants[0]!.role, 'whale');

  actor = 'api-tracer';
  const joined = await app.inject({
    method: 'POST',
    url: `/api/hunt/rooms/${room.roomCode}/join`,
    payload: { idempotencyKey: 'join-room' },
  });
  assert.equal(joined.statusCode, 200);
  assert.equal(joined.json().participants.length, 2);
  const row = readHuntRoom(db, room.roomCode);
  assert.ok(row?.match_id);

  const setup = await app.inject({ url: `/api/hunt/matches/${row.match_id}` });
  assert.equal(setup.statusCode, 200);
  assert.equal(setup.json().phase, 'setup');
  assert.equal('ownTargets' in setup.json(), false);

  actor = 'api-whale';
  const selected = await app.inject({
    method: 'POST',
    url: `/api/hunt/matches/${row.match_id}/commands`,
    payload: {
      kind: 'select-targets',
      primaryAssetId: 'hunt-synthetic-asset-1',
      secondaryAssetId: 'hunt-synthetic-asset-2',
      expectedStateVersion: 2,
      idempotencyKey: 'select-targets',
    },
  });
  assert.equal(selected.statusCode, 200);
  assert.equal(selected.json().phase, 'whale-planning');

  const stale = await app.inject({
    method: 'POST',
    url: `/api/hunt/matches/${row.match_id}/commands`,
    payload: {
      kind: 'submit-whale-plan',
      roundIndex: 1,
      action: 'wait',
      units: 0,
      expectedStateVersion: 2,
      idempotencyKey: 'stale-plan',
    },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'STALE_STATE');
  assert.equal(typeof stale.json().stateVersion, 'number');

  const invalid = await app.inject({
    method: 'POST',
    url: `/api/hunt/matches/${row.match_id}/commands`,
    payload: { kind: 'submit-whale-plan', roundIndex: 1, action: 'burst', units: 1 },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().code, 'INVALID_COMMAND');

  const planned = await app.inject({
    method: 'POST',
    url: `/api/hunt/matches/${row.match_id}/commands`,
    payload: {
      kind: 'submit-whale-plan',
      roundIndex: 1,
      action: 'burst',
      assetId: 'hunt-synthetic-asset-1',
      units: 4,
      expectedStateVersion: 3,
      idempotencyKey: 'plan-one',
    },
  });
  assert.equal(planned.statusCode, 200);
  assert.equal(planned.json().phase, 'tracer-investigation');

  actor = 'api-tracer';
  const tracer = await app.inject({ url: `/api/hunt/matches/${row.match_id}` });
  assert.equal(tracer.statusCode, 200);
  const tracerView = tracer.json();
  assert.equal('ownTargets' in tracerView, false);
  assert.equal('plans' in tracerView, false);
  assert.equal(tracerView.scansRemaining, 3);

  const scan = await app.inject({
    method: 'POST',
    url: `/api/hunt/matches/${row.match_id}/commands`,
    payload: {
      kind: 'purchase-scan',
      roundIndex: 1,
      scanId: 'hunt-synthetic-asset-1:flow',
      expectedStateVersion: 4,
      idempotencyKey: 'scan-one',
    },
  });
  assert.equal(scan.statusCode, 200);
  assert.equal(scan.json().sharedEvidence.length, 1);

  const replayBeforeEnd = await app.inject({
    url: `/api/hunt/matches/${row.match_id}/replay`,
  });
  assert.equal(replayBeforeEnd.statusCode, 409);
  assert.equal(replayBeforeEnd.json().code, 'INVALID_PHASE');
});
