import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  DailyAttemptView,
  DailyFiveTransport,
  DailySavedResult,
} from '../shared/daily-five.js';
import {
  SYNTHETIC_DAILY_FIVE,
  SYNTHETIC_DAILY_FINAL_RESULT,
  SYNTHETIC_DAILY_SAVED_RESULT,
} from '../fixtures/synthetic/contracts.js';
import { createDailyFiveApi, DailyFiveTransportError } from '../web/api/daily-five.js';
import { buildDailyFiveShareText } from '../web/share/daily-five.js';

register(
  'data:text/javascript,export%20async%20function%20load(url%2C%20context%2C%20nextLoad)%20%7B%20if%20(url.endsWith(%22.css%22))%20return%20%7B%20format%3A%20%22module%22%2C%20source%3A%20%22export%20default%20%7B%7D%3B%22%2C%20shortCircuit%3A%20true%20%7D%3B%20return%20nextLoad(url%2C%20context)%3B%20%7D',
  import.meta.url,
);

const {
  DailyFiveFinal,
  DailyFiveReveal,
  DailyFiveScreen,
  calculateAccuracyLabel,
  dailyNumberFromId,
  revealAsset,
} = await import('../web/daily-five/DailyFive.js');

const openAttempt: DailyAttemptView = {
  attemptId: 'attempt-open',
  dailyId: SYNTHETIC_DAILY_FIVE.dailyId,
  phase: 'round-open',
  stateVersion: 1,
  currentRoundIndex: 1,
  round: SYNTHETIC_DAILY_FIVE.rounds[0]!,
  savedResult: null,
  finalResult: null,
};

const savedAttempt: DailyAttemptView = {
  ...openAttempt,
  phase: 'saved-result',
  stateVersion: SYNTHETIC_DAILY_SAVED_RESULT.stateVersion,
  savedResult: SYNTHETIC_DAILY_SAVED_RESULT,
};

const finalAttempt: DailyAttemptView = {
  ...openAttempt,
  attemptId: 'attempt-final',
  phase: 'final-result',
  stateVersion: SYNTHETIC_DAILY_FINAL_RESULT.stateVersion,
  currentRoundIndex: null,
  round: null,
  finalResult: SYNTHETIC_DAILY_FINAL_RESULT,
};

function transportStub(): DailyFiveTransport {
  return {
    getToday: async () => SYNTHETIC_DAILY_FIVE,
    start: async () => openAttempt,
    resume: async () => openAttempt,
    unlock: async () => openAttempt,
    submit: async () => savedAttempt,
    continue: async () => finalAttempt,
  };
}

test('Daily Five views render saved reveals and a safe final share projection', () => {
  const reveal = renderToStaticMarkup(
    React.createElement(DailyFiveReveal, {
      attempt: savedAttempt,
      onContinue: () => undefined,
    }),
  );
  assert.match(reveal, /EARLIER EVIDENCE/);
  assert.match(reveal, /LATER OUTCOME/);
  assert.match(reveal, /WHY THIS RESULT/);
  assert.match(reveal, /Mystery A/);
  assert.match(reveal, /Next trade/);
  assert.match(reveal, /saved historical outcome/);

  const final = renderToStaticMarkup(
    React.createElement(DailyFiveFinal, {
      daily: SYNTHETIC_DAILY_FIVE,
      attempt: finalAttempt,
      mode: 'official',
      onStatus: () => undefined,
    }),
  );
  assert.match(final, /DAILY FIVE COMPLETE · OFFICIAL ATTEMPT/);
  assert.match(final, /DAILY FIVE #017/);
  assert.match(final, /\$49,960/);
  assert.match(final, /🟩/);
  assert.doesNotMatch(final, /Mystery [A-F]/);

  assert.equal(dailyNumberFromId('daily-2026-09-17'), '017');
  assert.equal(calculateAccuracyLabel(SYNTHETIC_DAILY_FINAL_RESULT), '3/4 directions');
  assert.equal(revealAsset(savedAttempt), 'Mystery A');
  assert.match(
    buildDailyFiveShareText({ dailyNumber: '17', result: SYNTHETIC_DAILY_FINAL_RESULT }),
    /\$49,960\n-0\.08% · 3\/4 directions/,
  );
});

test('Daily Five screen begins with an accessible loading state before transport effects run', () => {
  const markup = renderToStaticMarkup(
    React.createElement(DailyFiveScreen, { transport: transportStub() }),
  );
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /Loading the saved historical case/);
  assert.doesNotMatch(markup, /Mystery A/);
});

test('Daily Five transport uses current routes, command bodies, generated fallback keys, and API errors', async () => {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const attemptResponse: DailyAttemptView = {
    ...openAttempt,
    attemptId: 'attempt-transport',
  };
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    const url = String(input);
    const payload = url.endsWith('/today')
      ? SYNTHETIC_DAILY_FIVE
      : url.endsWith('/leaderboard')
        ? { dailyId: SYNTHETIC_DAILY_FIVE.dailyId, cohort: 'synthetic-case-pack-v1', entries: [] }
        : attemptResponse;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const api = createDailyFiveApi({
    basePath: '/api/',
    fetcher,
    createIdempotencyKey: (operation) => `generated-${operation}`,
  });

  await api.getToday();
  await api.start({ idempotencyKey: '' });
  await api.resume({ attemptId: 'attempt/transport' });
  await api.unlock('attempt-transport', {
    kind: 'unlock-clue',
    roundIndex: 1,
    assetId: 'daily-1-0',
    clueId: 'clue-1',
    expectedStateVersion: 1,
    idempotencyKey: '',
  });
  await api.submit('attempt-transport', {
    kind: 'cash',
    roundIndex: 1,
    expectedStateVersion: 1,
    idempotencyKey: 'ticket-1',
  });
  await api.continue('attempt-transport', {
    kind: 'continue',
    roundIndex: 1,
    expectedStateVersion: 2,
    idempotencyKey: 'continue-1',
  });
  await api.leaderboard(SYNTHETIC_DAILY_FIVE.dailyId);

  assert.deepEqual(
    requests.map(({ url, method }) => `${method} ${url}`),
    [
      'GET /api/daily-five/today',
      'POST /api/daily-five/synthetic-daily-2026-09-17/attempts',
      'GET /api/daily-five/attempts/attempt%2Ftransport',
      'POST /api/daily-five/attempts/attempt-transport/clues',
      'POST /api/daily-five/attempts/attempt-transport/tickets',
      'POST /api/daily-five/attempts/attempt-transport/continue',
      'GET /api/daily-five/synthetic-daily-2026-09-17/leaderboard',
    ],
  );
  assert.deepEqual(JSON.parse(requests[1]!.body!), { idempotencyKey: 'generated-start' });
  assert.equal(JSON.parse(requests[3]!.body!).idempotencyKey, 'generated-unlock-clue');
  assert.equal(JSON.parse(requests[4]!.body!).idempotencyKey, 'ticket-1');

  const errorApi = createDailyFiveApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: 'STALE_STATE',
          message: 'The command was based on an older state version.',
          retryable: true,
          stateVersion: 3,
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
  });
  await assert.rejects(errorApi.getToday(), (error: unknown) => {
    assert.ok(error instanceof DailyFiveTransportError);
    assert.equal(error.status, 409);
    assert.equal(error.apiError?.code, 'STALE_STATE');
    return true;
  });
});

test('saved result typing remains compatible with the current Daily Five contract', () => {
  const saved: DailySavedResult | null = savedAttempt.savedResult;
  assert.equal(saved?.phase, 'saved-result');
  assert.equal(saved?.next, 'continue');
});

test('Daily Five requests bound hung transports and body streams and retain error detail', async () => {
  for (const fetcher of [
    async () => new Promise<Response>(() => undefined),
    async () =>
      new Response(
        new ReadableStream({
          start() {
            /* Headers arrived; body never closes. */
          },
        }),
      ),
  ]) {
    const api = createDailyFiveApi({ timeoutMs: 15, fetcher });
    await assert.rejects(api.getToday(), (error: unknown) => {
      assert.ok(error instanceof DailyFiveTransportError);
      assert.equal(error.status, 408);
      assert.match(error.message, /Reconnect/);
      return true;
    });
  }
  const api = createDailyFiveApi({
    fetcher: async () =>
      new Response(JSON.stringify({ message: 'The case window is temporarily unavailable.' }), {
        status: 503,
      }),
  });
  await assert.rejects(api.getToday(), /case window is temporarily unavailable/);
});

test('missing rounds are recoverable errors while final results need no open round', async () => {
  const { requirePlayableAttempt } = await import('../web/daily-five/journey.js');
  assert.throws(
    () => requirePlayableAttempt({ ...openAttempt, round: null }),
    /Daily Five could not be restored/,
  );
  assert.equal(requirePlayableAttempt(finalAttempt), finalAttempt);
});
