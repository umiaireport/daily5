import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { SYNTHETIC_DAILY_FINAL_RESULT } from '../fixtures/synthetic/contracts.js';
import { ProgressionService } from '../server/domain/progression/index.js';
import { registerProgressionRoutes } from '../server/routes/progression.js';
import { openDatabase } from '../server/db/store.js';
import { money } from '../shared/game-rules.js';

test('progression routes expose authenticated history, honest comparison, and sanitized shares', async (t) => {
  const db = openDatabase(':memory:');
  const service = new ProgressionService(db, {
    clock: () => new Date('2026-09-17T12:00:00.000Z'),
    idFactory: () => 'opaque-share-id',
  });
  service.recordDailyResult({
    playerId: 'route-player',
    attemptId: 'route-attempt',
    dailyId: 'daily-route',
    mode: 'official',
    completedAt: '2026-09-17T12:00:00Z',
    variantId: 'variant-route',
    result: SYNTHETIC_DAILY_FINAL_RESULT,
  });
  const share = service.createShare({
    ownerPlayerId: 'route-player',
    result: {
      shareId: 'ignored-by-server',
      activity: 'daily-five',
      createdAt: 'ignored-by-server',
      equity: money('49960.00'),
      returnPct: '-0.08',
      comparison: service.compareDaily({ playerId: 'route-player', dailyId: 'daily-route' }),
    },
  });
  const app = Fastify({ logger: false });
  await registerProgressionRoutes(app, {
    service,
    playerId: () => 'route-player',
  });
  t.after(async () => {
    await app.close();
    db.close();
  });

  const history = await app.inject({ method: 'GET', url: '/api/progression' });
  assert.equal(history.statusCode, 200);
  assert.equal(history.json().dailyHistory.length, 1);

  const comparison = await app.inject({
    method: 'GET',
    url: '/api/daily-five/daily-route/comparison?scope=exact-variant',
  });
  assert.equal(comparison.statusCode, 200);
  assert.equal(comparison.json().eligibleAttempts, 1);
  assert.equal(comparison.json().percentile, null);

  const publicShare = await app.inject({
    method: 'GET',
    url: `/api/shares/${share.result.shareId}`,
  });
  assert.equal(publicShare.statusCode, 200);
  assert.equal(publicShare.json().activity, 'daily-five');
  assert.equal('result' in publicShare.json(), false);
  assert.equal(JSON.stringify(publicShare.json()).includes('SYNTHETIC'), false);

  const unauthorized = Fastify({ logger: false });
  await registerProgressionRoutes(unauthorized, { service });
  t.after(async () => unauthorized.close());
  const denied = await unauthorized.inject({ method: 'GET', url: '/api/progression' });
  assert.equal(denied.statusCode, 401);
});
