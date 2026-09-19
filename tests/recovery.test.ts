import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../server/app.js';
import { openDatabase, SCHEMA_VERSION } from '../server/db/store.js';
import type { Round, RoundResult } from '../shared/types.js';

test('unreviewed result survives restart; continue is authorized and never skips another result', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'whale-recovery-')), 'game.sqlite');
  const first = await buildApp({ databasePath });
  const session = await first.inject({ method: 'POST', url: '/api/sessions', payload: {} });
  const cookie = `whale_session=${session.cookies[0]!.value}`;
  const choiceUrl = '/api/scenarios/synthetic-v1-1/choice';
  const continueUrl = '/api/scenarios/synthetic-v1-1/continue';
  assert.equal(
    (await first.inject({ method: 'POST', url: continueUrl, headers: { cookie }, payload: {} }))
      .statusCode,
    403,
  );
  const locked = await first.inject({
    method: 'POST',
    url: choiceUrl,
    headers: { cookie },
    payload: { weights: [60, 30, 0, 10] },
  });
  const original = locked.json<RoundResult>();
  assert.equal(locked.statusCode, 200);
  await first.close();
  const resumed = await buildApp({ databasePath });
  try {
    const next = (
      await resumed.inject({ url: '/api/scenarios/next', headers: { cookie } })
    ).json<Round>();
    assert.equal(next.id, 'synthetic-v1-1');
    assert.equal(next.locked, true);
    assert.deepEqual(
      (
        await resumed.inject({ url: '/api/scenarios/synthetic-v1-1/result', headers: { cookie } })
      ).json(),
      original,
    );
    assert.equal(
      (
        await resumed.inject({
          method: 'POST',
          url: '/api/scenarios/synthetic-v1-2/choice',
          headers: { cookie },
          payload: { weights: [0, 0, 0, 100] },
        })
      ).statusCode,
      409,
    );
    const stranger = await resumed.inject({ method: 'POST', url: '/api/sessions', payload: {} });
    assert.equal(
      (
        await resumed.inject({
          method: 'POST',
          url: continueUrl,
          headers: { cookie: `whale_session=${stranger.cookies[0]!.value}` },
          payload: {},
        })
      ).statusCode,
      403,
    );
    for (let retry = 0; retry < 2; retry++) {
      const advanced = (
        await resumed.inject({ method: 'POST', url: continueUrl, headers: { cookie }, payload: {} })
      ).json<Round>();
      assert.equal(advanced.index, 2);
      assert.equal(advanced.locked, false);
    }
    await resumed.inject({
      method: 'POST',
      url: '/api/scenarios/synthetic-v1-2/choice',
      headers: { cookie },
      payload: { weights: [0, 0, 0, 100] },
    });
    const retry = (
      await resumed.inject({ method: 'POST', url: continueUrl, headers: { cookie }, payload: {} })
    ).json<Round>();
    assert.equal(retry.index, 2);
    assert.equal(retry.locked, true);
  } finally {
    await resumed.close();
  }
});

test('schema v1 upgrades preserve existing progress and immutable results', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'whale-upgrade-')), 'legacy.sqlite');
  const app = await buildApp({ databasePath: path });
  const session = await app.inject({ method: 'POST', url: '/api/sessions', payload: {} });
  const cookie = `whale_session=${session.cookies[0]!.value}`;
  const saved = (
    await app.inject({
      method: 'POST',
      url: '/api/scenarios/synthetic-v1-1/choice',
      headers: { cookie },
      payload: { weights: [0, 0, 0, 100] },
    })
  ).json();
  await app.close();
  const legacy = new DatabaseSync(path);
  legacy.exec('DROP TABLE round_reviews; PRAGMA user_version=1;');
  legacy.close();
  const migrated = await buildApp({ databasePath: path });
  try {
    const round = (
      await migrated.inject({ url: '/api/scenarios/next', headers: { cookie } })
    ).json<Round>();
    assert.equal(round.index, 2);
    assert.equal(round.locked, false);
    assert.deepEqual(
      (
        await migrated.inject({ url: '/api/scenarios/synthetic-v1-1/result', headers: { cookie } })
      ).json(),
      saved,
    );
  } finally {
    await migrated.close();
  }
  const db = openDatabase(path);
  assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, SCHEMA_VERSION);
  db.close();
});

test('a newer database schema is rejected without downgrading its version', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'whale-newer-')), 'future.sqlite');
  const future = new DatabaseSync(path);
  future.exec('PRAGMA user_version=99');
  future.close();
  assert.throws(() => openDatabase(path), /newer Whale Arena release/);
  const unchanged = new DatabaseSync(path);
  assert.equal(unchanged.prepare('PRAGMA user_version').get()!.user_version, 99);
  unchanged.close();
});
