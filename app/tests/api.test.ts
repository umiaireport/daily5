import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app.js';
import { SCENARIOS } from '../fixtures/synthetic/scenarios.js';
import type { Round, RoundResult, SessionState } from '../shared/types.js';

async function startSession(app: FastifyInstance): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/sessions', payload: {} });
  assert.equal(response.statusCode, 200);
  return `${response.cookies[0]!.name}=${response.cookies[0]!.value}`;
}

test('public rounds omit identities, locked clues, and all future outcome fields', async (t) => {
  const app = await buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  const cookie = await startSession(app);
  const response = await app.inject({ url: '/api/scenarios/next', headers: { cookie } });
  const round = response.json<Round>();
  assert.equal(round.mode, 'synthetic');
  assert.equal(round.unlocksRemaining, 2);
  for (const asset of round.assets) {
    assert.deepEqual(Object.keys(asset).sort(), ['alias', 'category', 'clues', 'id', 'series']);
    assert.deepEqual(asset.clues, {});
    assert.equal(asset.series.at(-1), 100);
  }
  for (const asset of SCENARIOS[0]!.assets) assert.equal(response.body.includes(asset.name), false);
  const result = await app.inject({
    url: `/api/scenarios/${round.id}/result`,
    headers: { cookie },
  });
  assert.equal(result.statusCode, 403);
  const future = await app.inject({
    method: 'POST',
    url: '/api/scenarios/synthetic-v1-5/choice',
    headers: { cookie },
    payload: { weights: [100, 0, 0, 0] },
  });
  assert.equal(future.statusCode, 409);
});

test('two clues across the entire board are atomic and duplicate unlock is free', async (t) => {
  const app = await buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  const cookie = await startSession(app);
  const unlock = (assetId: string, kind: string) =>
    app.inject({
      method: 'POST',
      url: '/api/scenarios/synthetic-v1-1/unlock',
      headers: { cookie },
      payload: { assetId, kind },
    });
  assert.equal((await unlock('a', 'flow')).json<Round>().unlocksRemaining, 1);
  assert.equal((await unlock('a', 'flow')).json<Round>().unlocksRemaining, 1);
  const attempts = await Promise.all([unlock('b', 'buyers'), unlock('c', 'pulse')]);
  assert.deepEqual(attempts.map((response) => response.statusCode).sort(), [200, 409]);
  const round = (
    await app.inject({ url: '/api/scenarios/next', headers: { cookie } })
  ).json<Round>();
  assert.equal(round.unlocksRemaining, 0);
  const clues = round.assets.flatMap((asset) => Object.values(asset.clues));
  assert.equal(clues.length, 2);
  assert.ok(clues.every((clue) => clue && Date.parse(clue.observedAt) <= Date.parse(round.cutoff)));
});

test('choice is immutable, repeat submission is identical, and another session cannot reveal it', async (t) => {
  const app = await buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  const cookie = await startSession(app);
  const choice = (weights: number[]) =>
    app.inject({
      method: 'POST',
      url: '/api/scenarios/synthetic-v1-1/choice',
      headers: { cookie },
      payload: { weights },
    });
  assert.equal((await choice([33, 33, 34, 0])).statusCode, 400);
  const first = await choice([40, 20, 10, 30]);
  assert.equal(first.statusCode, 200);
  assert.deepEqual((await choice([40, 20, 10, 30])).json(), first.json());
  assert.equal((await choice([100, 0, 0, 0])).statusCode, 409);
  const otherCookie = await startSession(app);
  assert.equal(
    (
      await app.inject({
        url: '/api/scenarios/synthetic-v1-1/result',
        headers: { cookie: otherCookie },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/scenarios/synthetic-v1-1/unlock',
        headers: { cookie },
        payload: { assetId: 'c', kind: 'pulse' },
      })
    ).statusCode,
    409,
  );
});

test('complete five-round runs compound returns and leaderboard includes only completed sessions', async (t) => {
  const app = await buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  const cookie = await startSession(app);
  await startSession(app);
  assert.deepEqual((await app.inject({ url: '/api/leaderboard', headers: { cookie } })).json(), {
    entries: [],
  });
  let equity = 10_000;
  for (let index = 1; index <= 5; index++) {
    const round = (
      await app.inject({ url: '/api/scenarios/next', headers: { cookie } })
    ).json<Round>();
    assert.equal(round.index, index);
    const result = (
      await app.inject({
        method: 'POST',
        url: `/api/scenarios/${round.id}/choice`,
        headers: { cookie },
        payload: { weights: [40, 20, 20, 20] },
      })
    ).json<RoundResult>();
    equity *= result.endEquity / result.startCash;
    assert.ok(Math.abs(result.sessionEquity - equity) < 1e-8);
    assert.equal(result.complete, index === 5);
    if (index < 5)
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: `/api/scenarios/${round.id}/continue`,
            headers: { cookie },
            payload: {},
          })
        ).statusCode,
        200,
      );
  }
  const session = (
    await app.inject({ url: '/api/session', headers: { cookie } })
  ).json<SessionState>();
  assert.equal(session.completedRounds, 5);
  assert.ok(Math.abs(session.equity - equity) < 1e-8);
  assert.equal(
    (await app.inject({ url: '/api/scenarios/next', headers: { cookie } })).json<Round>().locked,
    true,
  );
  const board = (await app.inject({ url: '/api/leaderboard', headers: { cookie } })).json();
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].isYou, true);
});

test('saved choices and clue budget survive a server restart and cookie resumes the same session', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'whale-persistence-')), 'game.sqlite');
  const first = await buildApp({ databasePath });
  const cookie = await startSession(first);
  await first.inject({
    method: 'POST',
    url: '/api/scenarios/synthetic-v1-1/choice',
    headers: { cookie },
    payload: { weights: [0, 0, 0, 100] },
  });
  await first.inject({
    method: 'POST',
    url: '/api/scenarios/synthetic-v1-1/continue',
    headers: { cookie },
    payload: {},
  });
  await first.inject({
    method: 'POST',
    url: '/api/scenarios/synthetic-v1-2/unlock',
    headers: { cookie },
    payload: { assetId: 'a', kind: 'flow' },
  });
  await first.close();
  const second = await buildApp({ databasePath });
  try {
    const session = (
      await second.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: { cookie },
        payload: {},
      })
    ).json<SessionState>();
    assert.equal(session.completedRounds, 1);
    assert.equal(session.equity, 10_000);
    const round = (
      await second.inject({ url: '/api/scenarios/next', headers: { cookie } })
    ).json<Round>();
    assert.equal(round.index, 2);
    assert.equal(round.unlocksRemaining, 1);
    assert.equal(
      (
        await second.inject({ url: '/api/scenarios/synthetic-v1-1/result', headers: { cookie } })
      ).json<RoundResult>().endEquity,
      10_000,
    );
  } finally {
    await second.close();
  }
});

test('daily challenge is published through the API, locks one official entry, and keeps settlement private', async (t) => {
  const app = await buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  assert.equal((await app.inject({ url: '/api/daily/today/result' })).statusCode, 401);
  const cookie = await startSession(app);
  const summary = (await app.inject({ url: '/api/daily/today' })).json<{
    available: boolean;
    status: string;
    id: string;
    challenge: { assetIds: string[]; rules: unknown; settlement?: unknown };
  }>();
  assert.equal(summary.available, true);
  assert.equal(summary.status, 'pending');
  assert.equal(summary.challenge.assetIds.length, 3);
  assert.equal(summary.challenge.settlement, undefined);
  const entry = await app.inject({
    method: 'POST',
    url: '/api/daily/today/entry',
    headers: { cookie },
    payload: { weights: [40, 20, 10, 30] },
  });
  assert.equal(entry.statusCode, 200);
  assert.equal(entry.json().status, 'pending');
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/daily/today/entry',
        headers: { cookie },
        payload: { weights: [100, 0, 0, 0] },
      })
    ).statusCode,
    409,
  );
  const result = await app.inject({ url: '/api/daily/today/result', headers: { cookie } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json(), {
    status: 'pending',
    challengeId: summary.id,
    weights: [40, 20, 10, 30],
  });
});

test('production cookies are secure and cross-origin mutations are rejected', async (t) => {
  const app = await buildApp({ databasePath: ':memory:', production: true });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/sessions', payload: {} });
  const setCookie = response.headers['set-cookie'] as string;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/sessions/reset',
        headers: { origin: 'https://evil.example' },
        payload: {},
      })
    ).statusCode,
    403,
  );
  assert.equal((await app.inject({ url: '/api/scenarios/next' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/admin/usage' })).statusCode, 401);
  const daily = (await app.inject({ url: '/api/challenges/today' })).json();
  assert.equal(daily.available, false);
  assert.ok(daily.reason.length > 30);
});

test('ties have reproducible ordering and a fresh run preserves completed leaderboard results', async (t) => {
  const app = await buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  const players: { cookie: string; id: string; name: string }[] = [];
  for (let player = 0; player < 2; player++) {
    const cookie = await startSession(app);
    const state = (
      await app.inject({ url: '/api/session', headers: { cookie } })
    ).json<SessionState>();
    players.push({ cookie, id: state.id, name: state.name });
    for (const scenario of SCENARIOS) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/scenarios/${scenario.id}/choice`,
        headers: { cookie },
        payload: { weights: [0, 0, 0, 100] },
      });
      assert.equal(response.statusCode, 200);
      if (scenario.index < 5)
        await app.inject({
          method: 'POST',
          url: `/api/scenarios/${scenario.id}/continue`,
          headers: { cookie },
          payload: {},
        });
    }
  }
  const oldCookie = players[0]!.cookie;
  const before = (
    await app.inject({ url: '/api/leaderboard', headers: { cookie: oldCookie } })
  ).json();
  assert.deepEqual(
    before.entries.map((entry: { name: string }) => entry.name),
    players.sort((a, b) => a.id.localeCompare(b.id)).map((player) => player.name),
  );
  const reset = await app.inject({
    method: 'POST',
    url: '/api/sessions/reset',
    headers: { cookie: oldCookie },
    payload: {},
  });
  assert.equal(reset.json<SessionState>().completedRounds, 0);
  assert.equal(reset.json<SessionState>().equity, 10_000);
  assert.ok(players.every((player) => player.id !== reset.json<SessionState>().id));
  const newCookie = `${reset.cookies[0]!.name}=${reset.cookies[0]!.value}`;
  const after = (
    await app.inject({ url: '/api/leaderboard', headers: { cookie: newCookie } })
  ).json();
  assert.equal(after.entries.length, 2);
  assert.ok(after.entries.every((entry: { isYou: boolean }) => !entry.isYou));
});
