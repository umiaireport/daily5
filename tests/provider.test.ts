import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createNansenClient,
  ProviderError,
  retryDelay,
  type AttemptEvent,
  type ClientOptions,
  type Operation,
} from '../server/nansen/client.ts';

const requestSchema = {
  parse: (input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('invalid');
    return input;
  },
};
const responseSchema = {
  parse: (input: unknown): { data: number | null; warnings: string[]; truncated: boolean } => {
    if (
      !input ||
      typeof input !== 'object' ||
      !('data' in input) ||
      (input.data !== null && typeof input.data !== 'number') ||
      !('warnings' in input) ||
      !Array.isArray(input.warnings) ||
      !('truncated' in input) ||
      typeof input.truncated !== 'boolean'
    )
      throw new Error('invalid provider secret');
    return input as { data: number | null; warnings: string[]; truncated: boolean };
  },
};
const valid = { data: 12, warnings: [], truncated: false };

function fixture(responses: Array<Response | Error>, overrides: Partial<ClientOptions> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const waits: number[] = [];
  const events: AttemptEvent[] = [];
  const client = createNansenClient({
    enabled: true,
    apiKey: 'fixture-secret',
    creditBudget: 100,
    now: () => 1_800_000_000_000,
    random: () => 0,
    sleep: async (ms) => {
      waits.push(ms);
    },
    onAttempt: (event) => events.push(event),
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error('Unexpected fetch');
      return response;
    },
    ...overrides,
  });
  return {
    client,
    calls,
    waits,
    events,
    request: (body: unknown = { chain: 'base' }) =>
      client.request('liveCandidates', body, requestSchema, responseSchema),
  };
}

test('disabled provider and invalid requests never dispatch', async () => {
  const disabled = fixture([], { enabled: false });
  await assert.rejects(disabled.request(), { code: 'disabled' });
  assert.equal(disabled.calls.length, 0);
  const enabled = fixture([]);
  await assert.rejects(enabled.request(null), { code: 'request-schema' });
  await assert.rejects(
    enabled.client.request('constructor' as Operation, {}, requestSchema, responseSchema),
    { code: 'endpoint' },
  );
  assert.equal(enabled.calls.length, 0);
});

test('allowlisted requests use server authentication and block redirects', async () => {
  const f = fixture([Response.json(valid)]);
  await f.request();
  assert.equal(f.calls[0].url, 'https://api.nansen.ai/api/v1/token-screener');
  assert.equal(f.calls[0].init?.method, 'POST');
  assert.equal(f.calls[0].init?.redirect, 'error');
  assert.equal((f.calls[0].init?.headers as Record<string, string>).apikey, 'fixture-secret');
  assert.equal(JSON.stringify(f.events).includes('fixture-secret'), false);
});

test('cache preserves nulls, warnings and truncation without counting another provider call', async () => {
  const f = fixture([
    Response.json({ data: null, warnings: ['Partial coverage'], truncated: true }),
  ]);
  const first = await f.request({ chain: 'base', page: 1 });
  first.data.warnings.push('local mutation');
  const second = await f.request({ page: 1, chain: 'base' });
  assert.deepEqual(second, {
    data: { data: null, warnings: ['Partial coverage'], truncated: true },
    cached: true,
  });
  assert.deepEqual(f.client.usage(), {
    attempts: 1,
    successfulHttpCalls: 1,
    dataValidCalls: 1,
    cacheHits: 1,
    accountedCredits: 1,
    actualDeductedCredits: 0,
    attemptsWithUnknownCredits: 1,
  });
});

test('expired cache fetches again', async () => {
  let clock = 0;
  const f = fixture([Response.json(valid), Response.json(valid)], { now: () => clock });
  await f.request();
  clock = 300_001;
  await f.request();
  assert.equal(f.calls.length, 2);
});

for (const [status, code] of [
  [401, 'credentials'],
  [402, 'credits'],
  [400, 'http'],
] as const) {
  test(`${status} stops immediately without exposing provider error body`, async () => {
    const f = fixture([new Response('fixture-secret: private response', { status })]);
    await assert.rejects(
      f.request(),
      (error: unknown) =>
        error instanceof ProviderError &&
        error.code === code &&
        !error.message.includes('fixture-secret'),
    );
    assert.equal(f.calls.length, 1);
    assert.equal(f.client.usage().successfulHttpCalls, 0);
    assert.equal(JSON.stringify(f.events).includes('private response'), false);
  });
}

test('provider insufficient-credit responses map to a safe credits error', async () => {
  const f = fixture([
    Response.json(
      { code: 'insufficient_credits', message: 'private billing context' },
      { status: 403 },
    ),
  ]);
  await assert.rejects(
    f.request(),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === 'credits' &&
      !error.message.includes('private billing context'),
  );
  assert.equal(f.calls.length, 1);
});

test('429 obeys Retry-After and retries at most twice', async () => {
  const f = fixture(
    [429, 429, 429].map(
      (status) => new Response(null, { status, headers: { 'Retry-After': '3' } }),
    ),
  );
  await assert.rejects(f.request(), { code: 'rate-limit' });
  assert.equal(f.calls.length, 3);
  assert.equal(f.waits.filter((ms) => ms === 3_000).length, 2);
  assert.equal(f.client.usage().accountedCredits, 3);
  assert.equal(
    retryDelay('Tue, 15 Sep 2026 12:00:03 GMT', Date.parse('2026-09-15T12:00:00Z'), 0, 0),
    3_000,
  );
});

test('transient HTTP and network failures recover without inflating success counts', async () => {
  const f = fixture([
    new Response(null, { status: 503 }),
    new Error('secret network context'),
    Response.json(valid),
  ]);
  assert.deepEqual((await f.request()).data, valid);
  assert.equal(f.client.usage().attempts, 3);
  assert.equal(f.client.usage().successfulHttpCalls, 1);
  assert.equal(f.client.usage().dataValidCalls, 1);
});

test('schema mismatch is a successful HTTP call but not valid data or retryable', async () => {
  const f = fixture([Response.json({ wrong: 'fixture-secret' })]);
  await assert.rejects(f.request(), { code: 'schema' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.client.usage().successfulHttpCalls, 1);
  assert.equal(f.client.usage().dataValidCalls, 0);
});

test('budget stops retry dispatch and accounts unknown failure charges conservatively', async () => {
  const f = fixture([new Response(null, { status: 503 })], { creditBudget: 1 });
  await assert.rejects(f.request(), { code: 'budget' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.client.usage().attempts, 1);
});

test('concurrent requests reserve budget before dispatch', async () => {
  const f = fixture([Response.json(valid)], { creditBudget: 1 });
  const outcomes = await Promise.allSettled([f.request({ page: 1 }), f.request({ page: 2 })]);
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(f.calls.length, 1);
});

test('verified credit header reconciles actual charge and prevents additional overspend', async () => {
  const f = fixture([Response.json(valid, { headers: { 'test-deducted-credits': '3' } })], {
    creditBudget: 3,
    verifiedCreditHeader: 'test-deducted-credits',
  });
  await f.request();
  await assert.rejects(f.request({ page: 2 }), { code: 'budget' });
  assert.equal(f.client.usage().actualDeductedCredits, 3);
  assert.equal(f.client.usage().accountedCredits, 3);
  assert.equal(f.client.usage().attemptsWithUnknownCredits, 0);
});

test('timeouts abort each request and stop after two retries', async () => {
  const signals: AbortSignal[] = [];
  const f = fixture([], {
    timeoutMs: 5,
    fetch: async (_input, init) => {
      signals.push(init!.signal!);
      return new Promise<Response>(() => {});
    },
  });
  await assert.rejects(f.request(), { code: 'timeout' });
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.equal(f.client.usage().attempts, 3);
});
