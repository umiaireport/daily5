import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../server/app.js';

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }): string {
  const value = response.headers['set-cookie'];
  const first = Array.isArray(value) ? value[0] : value;
  assert.equal(typeof first, 'string', 'expected the server to set an auth cookie');
  return first.split(';', 1)[0]!;
}

test('Daily5 supports account registration, login, session lookup, and logout', async () => {
  const app = await buildApp({ databasePath: ':memory:', dataMode: 'synthetic' });
  try {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'reader_one',
        password: 'a secure password',
        displayName: 'Market Reader',
      },
    });
    assert.equal(registered.statusCode, 201);
    assert.deepEqual(registered.json(), {
      username: 'reader_one',
      displayName: 'Market Reader',
    });
    const cookie = cookieFrom(registered);

    const me = await app.inject({ url: '/api/auth/me', headers: { cookie } });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json(), { username: 'reader_one', displayName: 'Market Reader' });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'READER_ONE', password: 'a secure password' },
    });
    assert.equal(duplicate.statusCode, 409);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
      payload: {},
    });
    assert.equal(logout.statusCode, 200);

    const afterLogout = await app.inject({ url: '/api/auth/me', headers: { cookie } });
    assert.equal(afterLogout.statusCode, 401);

    const demo = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'demo', password: 'demo' },
    });
    assert.equal(demo.statusCode, 200);
    assert.deepEqual(demo.json(), { username: 'demo', displayName: 'demo' });
  } finally {
    await app.close();
  }
});
