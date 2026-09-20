import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerDailyFiveRoutes } from '../server/routes/daily-five.js';
import { DailyFiveEngine } from '../server/domain/daily-five/index.js';
import { openDatabase } from '../server/db/store.js';

test('Daily Five route registrar exposes public today, current attempt, and structured command errors', async (t) => {
  const db = openDatabase(':memory:');
  const engine = new DailyFiveEngine(db, () => new Date('2026-09-17T12:00:00.000Z'));
  const app = Fastify({ logger: false });
  await registerDailyFiveRoutes(app, { engine, playerId: () => 'route-player' });
  t.after(async () => {
    await app.close();
    db.close();
  });

  const today = await app.inject({ method: 'GET', url: '/api/daily-five/today' });
  assert.equal(today.statusCode, 200);
  assert.equal(today.json().rounds.length, 5);
  assert.equal(today.body.includes('candles'), false);

  const started = await app.inject({
    method: 'POST',
    url: '/api/daily-five/daily-2026-09-17/attempts',
    payload: { idempotencyKey: 'route-start' },
  });
  assert.equal(started.statusCode, 200);
  const view = started.json();
  assert.equal(view.phase, 'round-open');

  const resumed = await app.inject({
    method: 'GET',
    url: `/api/daily-five/attempts/${view.attemptId}`,
  });
  assert.equal(resumed.statusCode, 200);
  assert.deepEqual(resumed.json(), view);

  const stale = await app.inject({
    method: 'POST',
    url: `/api/daily-five/attempts/${view.attemptId}/tickets`,
    payload: {
      kind: 'cash',
      roundIndex: 1,
      expectedStateVersion: 99,
      idempotencyKey: 'route-stale',
    },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'STALE_STATE');

  const invalid = await app.inject({
    method: 'POST',
    url: `/api/daily-five/attempts/${view.attemptId}/tickets`,
    payload: { kind: 'cash', roundIndex: 1 },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().code, 'INVALID_COMMAND');
});
