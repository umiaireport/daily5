import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildApp } from '../server/app.js';

test(
  'built production app serves the Daily5 bundle and API without exposing source',
  { skip: !existsSync('public/index.html') },
  async (t) => {
    const app = await buildApp({ databasePath: ':memory:', production: true, serveStatic: true });
    t.after(() => app.close());
    const index = await app.inject('/');
    assert.equal(index.statusCode, 200);
    assert.match(index.headers['content-security-policy'] as string, /default-src 'self'/);
    const asset = index.body.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
    assert.ok(asset);
    const bundle = await app.inject(asset);
    assert.equal(bundle.statusCode, 200);
    assert.match(bundle.headers['content-type'] as string, /javascript/);
    assert.doesNotMatch(bundle.body, /synthetic-v1-1|\/api\/scenarios/);
    assert.equal((await app.inject('/server/domain/removed.ts')).statusCode, 404);
    assert.equal((await app.inject('/.env')).statusCode, 404);
    assert.equal((await app.inject('/api/missing')).statusCode, 404);
    const daily = await app.inject('/api/daily-five/today');
    assert.equal(daily.statusCode, 200);
    assert.equal(daily.json().rounds.length, 5);
  },
);
