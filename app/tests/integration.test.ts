import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../server/app.js';
import { openDatabase } from '../server/db/store.js';
import type { DailyAttemptView } from '../shared/daily-five.js';
import type { HuntMatchView, HuntReveal } from '../shared/hunt.js';

async function player(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({ method: 'POST', url: '/api/sessions', payload: {} });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers['set-cookie']!.toString().split(';')[0]!;
}
async function request(
  app: Awaited<ReturnType<typeof buildApp>>,
  cookie: string,
  url: string,
  payload?: Record<string, unknown>,
) {
  const response =
    payload === undefined
      ? await app.inject({ method: 'GET', url, headers: { cookie } })
      : await app.inject({ method: 'POST', url, headers: { cookie }, payload });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

test('integrated Daily Five persists a cumulative wallet, labels practice, projects once, and restarts', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'whale-integration-')), 'arena.sqlite');
  let app = await buildApp({ databasePath: path, dataMode: 'synthetic', rateLimitMax: 2000 });
  const cookie = await player(app);
  const today = await request(app, cookie, '/api/daily-five/today');
  let attempt: DailyAttemptView = await request(
    app,
    cookie,
    `/api/daily-five/${today.dailyId}/attempts`,
    { idempotencyKey: 'first' },
  );
  const id = attempt.attemptId;
  assert.equal(attempt.mode, 'official');
  assert.doesNotMatch(
    JSON.stringify(attempt),
    /outcomeCandles|tokenAddress|realAssetKey|factualHeadline/,
  );
  const asset = attempt.round!.candidates[0]!;
  attempt = await request(app, cookie, `/api/daily-five/attempts/${id}/clues`, {
    kind: 'unlock-clue',
    roundIndex: 1,
    assetId: asset.assetId,
    clueId: asset.clueDescriptors[0]!.clueId,
    expectedStateVersion: attempt.stateVersion,
    idempotencyKey: 'clue',
  });
  assert.equal(attempt.round!.unlocksRemaining, 2);
  await app.close();
  app = await buildApp({ databasePath: path, dataMode: 'synthetic', rateLimitMax: 2000 });
  attempt = await request(app, cookie, `/api/daily-five/attempts/${id}`);
  assert.equal(attempt.round!.unlocksRemaining, 2);
  for (let roundIndex = 1; roundIndex <= 5; roundIndex++) {
    const command = {
      kind: 'cash',
      roundIndex,
      expectedStateVersion: attempt.stateVersion,
      idempotencyKey: `cash-${roundIndex}`,
    };
    attempt = await request(app, cookie, `/api/daily-five/attempts/${id}/tickets`, command);
    assert.equal(attempt.savedResult!.result.endingEquity, '10000.00');
    assert.deepEqual(
      await request(app, cookie, `/api/daily-five/attempts/${id}/tickets`, command),
      attempt,
    );
    attempt = await request(app, cookie, `/api/daily-five/attempts/${id}/continue`, {
      kind: 'continue',
      roundIndex,
      expectedStateVersion: attempt.stateVersion,
      idempotencyKey: `next-${roundIndex}`,
    });
  }
  assert.equal(attempt.finalResult!.totalEquity, '10000.00');
  const profile = await request(app, cookie, '/api/progression');
  assert.equal(profile.dailyHistory.length, 1);
  const comparison = await request(app, cookie, `/api/daily-five/${today.dailyId}/comparison`);
  assert.equal(comparison.scope.kind, 'exact-variant');
  assert.equal(comparison.percentile, null);
  const board = await request(app, cookie, `/api/daily-five/${today.dailyId}/leaderboard`);
  assert.equal(board.entries.length, 1);
  const practice = await request(app, cookie, `/api/daily-five/${today.dailyId}/attempts`, {
    idempotencyKey: 'again',
  });
  assert.equal(practice.mode, 'practice');
  const outsider = await player(app);
  const forbidden = await app.inject({
    url: `/api/daily-five/attempts/${id}`,
    headers: { cookie: outsider },
  });
  assert.equal(forbidden.statusCode, 403);
  await app.close();
  app = await buildApp({ databasePath: path, dataMode: 'synthetic' });
  assert.deepEqual(await request(app, cookie, '/api/progression'), profile);
  await app.close();
});

test('mounted Hunt completes lone tracer and whale games with bots, safe replay, and honest profile', async () => {
  const app = await buildApp({
    databasePath: ':memory:',
    dataMode: 'synthetic',
    rateLimitMax: 2000,
  });
  try {
    for (const role of ['tracer', 'whale'] as const) {
      const cookie = await player(app);
      const queue = await request(
        app,
        cookie,
        `/api/hunt/queue?role=${role}&playComputersNow=true`,
        { maxTracers: 1, expectedStateVersion: 1, idempotencyKey: `queue-${role}` },
      );
      const path = `/api/hunt/matches/${queue.matchId}`;
      let view: HuntMatchView = await request(app, cookie, path);
      assert.equal(view.participants.filter((p) => p.kind === 'computer').length, 1);
      const [a, b] = view.assets.map((a) => a.assetId);
      let counter = 0;
      async function command(body: object) {
        const result = (await request(app, cookie, `${path}/commands`, {
          ...body,
          expectedStateVersion: view.stateVersion,
          idempotencyKey: `command-${++counter}`,
        })) as HuntMatchView | HuntReveal;
        if ('stateVersion' in result) view = result;
        return result;
      }
      if (role === 'whale')
        await command({ kind: 'select-targets', primaryAssetId: a, secondaryAssetId: b });
      else
        assert.doesNotMatch(
          JSON.stringify(view),
          /ownTargets|plans_payload|tokenAddress|outcomeCandles/,
        );
      const earlyReplay = await app.inject({ url: `${path}/replay-summary`, headers: { cookie } });
      assert.equal(earlyReplay.statusCode, 409);
      for (let roundIndex = 1; roundIndex <= 5; roundIndex++) {
        if (role === 'whale')
          await command({
            kind: 'submit-whale-plan',
            roundIndex,
            action: roundIndex <= 3 ? 'burst' : 'wait',
            units: roundIndex <= 3 ? 4 : 0,
            ...(roundIndex <= 3 ? { assetId: roundIndex <= 2 ? a : b } : {}),
          });
        else {
          assert.notEqual(view.viewerRole, 'whale');
          const scanId = view.assets[0]!.clueDescriptors[0]!.clueId;
          await command({ kind: 'purchase-scan', roundIndex, scanId });
          await command({
            kind: 'submit-suspicion',
            roundIndex,
            primaryAssetId: a,
            secondaryAssetId: b,
          });
          await command({ kind: 'finish-investigation', roundIndex });
        }
      }
      if (role === 'tracer')
        await command({ kind: 'final-accusation', primaryAssetId: a, secondaryAssetId: b });
      const replay = await request(app, cookie, `${path}/replay-summary`);
      assert.equal(replay.rounds.length, 5);
      assert.equal(replay.reveal.identities[0].name, 'Synthetic Asset 1');
      assert.equal(replay.reveal.identities[0].symbol, 'SYN1');
      assert.doesNotMatch(
        JSON.stringify(replay),
        /board_payload|tokenAddress|outcomeCandles|actorId|seed/,
      );
      const profile = await request(app, cookie, '/api/progression');
      assert.equal(profile.huntHistory.length, 1);
      assert.equal(profile.huntHistory[0].matchKind, 'computer');
      const outsider = await player(app);
      assert.equal(
        (await app.inject({ url: path, headers: { cookie: outsider } })).statusCode,
        403,
      );
    }
    const denied = await app.inject({
      method: 'DELETE',
      url: '/api/hunt/queue/unknown',
      headers: { origin: 'https://other.invalid' },
      payload: {},
    });
    assert.equal(denied.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('all additive tables migrate a copy of legacy records without rewriting choices or forward daily results', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'whale-legacy-integration-')), 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE choices (session_id TEXT NOT NULL REFERENCES sessions(id),scenario_id TEXT NOT NULL,weights TEXT NOT NULL,result TEXT NOT NULL,locked_at TEXT NOT NULL,PRIMARY KEY(session_id,scenario_id));
    INSERT INTO sessions VALUES ('old','Explorer','2026-09-01');
    INSERT INTO choices VALUES ('old','old-case','{"cash":100}','{"equity":10000}','2026-09-01'); PRAGMA user_version=1;`);
  const before = legacy.prepare('SELECT * FROM choices').all();
  legacy.close();
  const db = openDatabase(path);
  assert.deepEqual(db.prepare('SELECT * FROM choices').all(), before);
  for (const name of [
    'daily_challenges',
    'daily_five_attempts',
    'hunt_matches',
    'hunt_queue_entries',
    'progression_daily_results',
  ]) {
    assert.ok(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name),
      name,
    );
  }
  assert.equal(
    (db.prepare('SELECT count(*) AS count FROM round_reviews').get() as { count: number }).count,
    1,
  );
  db.close();
});
