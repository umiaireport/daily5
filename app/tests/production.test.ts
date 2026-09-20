import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildApp } from '../server/app.js';

test(
  'built production app serves the bundle, secure sessions and API without exposing source',
  { skip: !existsSync('dist/index.html') },
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
    assert.doesNotMatch(bundle.body, /Coral|synthetic-v1-1/);
    assert.equal((await app.inject('/server/domain/game.ts')).statusCode, 404);
    assert.equal((await app.inject('/.env')).statusCode, 404);
    assert.equal((await app.inject('/api/missing')).statusCode, 404);
    const session = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {},
      headers: { host: 'arena.example', origin: 'https://arena.example' },
    });
    assert.equal(session.statusCode, 200);
    assert.match(session.headers['set-cookie'] as string, /Secure/);
  },
);
