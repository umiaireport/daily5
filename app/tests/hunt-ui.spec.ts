import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { HuntRequest } from '../web/api/hunt.js';
import { HuntApiError, createHuntApiTransport } from '../web/api/hunt.js';
import {
  SYNTHETIC_HUNT_REVEAL,
  SYNTHETIC_HUNT_TRACER_VIEW,
  SYNTHETIC_HUNT_WHALE_VIEW,
} from '../fixtures/synthetic/contracts.js';

const huntScreenSource = readFileSync(
  new URL('../web/hunt/HuntScreen.tsx', import.meta.url),
  'utf8',
);
const huntCss = readFileSync(new URL('../web/hunt.css', import.meta.url), 'utf8');

test('hunt transport keeps role filtering, command paths, and replay requests explicit', async () => {
  const calls: Array<{ path: string; method: string; body?: string }> = [];
  const request: HuntRequest = async <T>(path: string, init: RequestInit = {}) => {
    calls.push({
      path,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? init.body : undefined,
    });
    if (path === '/hunt/queue')
      return { queueId: 'queue-1', status: 'queued', maxTracers: 1, queuedAt: 'now' } as T;
    if (path.includes('/commands')) return SYNTHETIC_HUNT_TRACER_VIEW as T;
    if (path.endsWith('/replay')) return [SYNTHETIC_HUNT_REVEAL] as T;
    if (path.includes('/matches/')) return SYNTHETIC_HUNT_WHALE_VIEW as T;
    return {
      roomId: 'room-1',
      roomCode: 'SYNTH1',
      phase: 'lobby',
      participants: [],
      maxTracers: 1,
      deadline: null,
    } as T;
  };
  const transport = createHuntApiTransport(request);

  await transport.enqueue({ maxTracers: 1, expectedStateVersion: 1, idempotencyKey: 'enqueue-1' });
  await transport.status('queue-1');
  await transport.cancel('queue-1', { expectedStateVersion: 1, idempotencyKey: 'cancel-1' });
  await transport.createRoom({ maxTracers: 5, idempotencyKey: 'room-1' });
  await transport.joinRoom('SYNTH1', { idempotencyKey: 'join-1' });
  await transport.getMatch('hunt-match-1', 'tracer');
  await transport.command(
    'hunt-match-1',
    {
      kind: 'purchase-scan',
      roundIndex: 1,
      scanId: 'scan-1',
      expectedStateVersion: 4,
      idempotencyKey: 'scan-1',
    },
    'captain',
  );
  await transport.replay('hunt-match-1');

  assert.deepEqual(
    calls.map(({ path, method }) => `${method} ${path}`),
    [
      'POST /hunt/queue',
      'GET /hunt/queue/queue-1',
      'DELETE /hunt/queue/queue-1',
      'POST /hunt/rooms',
      'POST /hunt/rooms/SYNTH1/join',
      'GET /hunt/matches/hunt-match-1?viewerRole=tracer',
      'POST /hunt/matches/hunt-match-1/commands?viewerRole=captain',
      'GET /hunt/matches/hunt-match-1/replay',
    ],
  );
  assert.match(calls[6]!.body ?? '', /"kind":"purchase-scan"/);
});

test('hunt API errors retain server retry and state metadata', () => {
  const error = new HuntApiError('Stale hunt state', {
    code: 'STALE_STATE',
    retryable: true,
    stateVersion: 9,
  });
  assert.equal(error.name, 'HuntApiError');
  assert.equal(error.code, 'STALE_STATE');
  assert.equal(error.retryable, true);
  assert.equal(error.stateVersion, 9);
});

test('entry, role views, and final reconstruction expose the Hunt acceptance copy', () => {
  assert.match(huntScreenSource, /Build your position\. Leave them chasing the wrong trail\./);
  assert.match(huntScreenSource, /Read the footprints\. Find the hidden targets\./);
  assert.match(huntScreenSource, /Finding players… computers join in 8 seconds\./);
  assert.match(huntScreenSource, /Six locations\. One hidden pattern\./);
  assert.match(huntScreenSource, /Finish investigating/);
  assert.match(huntScreenSource, /FINAL RECONSTRUCTION/);
  assert.match(huntScreenSource, /Skip reveal animation/);
  assert.match(huntScreenSource, /Rematch/);
  assert.match(huntScreenSource, /Swap roles/);

  const tracerPanelStart = huntScreenSource.indexOf('function TracerPanel');
  const revealPanelStart = huntScreenSource.indexOf('function HuntRevealPanel');
  assert.notEqual(tracerPanelStart, -1);
  assert.notEqual(revealPanelStart, -1);
  const tracerPanel = huntScreenSource.slice(tracerPanelStart, revealPanelStart);
  assert.doesNotMatch(tracerPanel, /ownTargets|unitsPurchased|decoyUnits/);
  assert.match(huntScreenSource.slice(0, tracerPanelStart), /view\.ownTargets/);
});

test('hunt CSS provides keyboard targets, mobile board behavior, and reduced motion', () => {
  assert.match(huntCss, /min-height:\s*2\.75rem/);
  assert.match(huntCss, /\.hunt-board\s*\{/);
  assert.match(huntCss, /\.hunt-map-card\s*\{/);
  assert.match(huntCss, /@media \(max-width: 360px\)/);
  assert.match(huntCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(huntCss, /\.hunt-footprint-preview--decoy/);
});
