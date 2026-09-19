import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHuntEvents } from '../server/db/hunt.js';
import { readHuntParticipants } from '../server/db/hunt.js';
import { openDatabase } from '../server/db/store.js';
import { HuntService } from '../server/services/hunt-service.js';
import type { HuntMatchView } from '../shared/hunt.js';

test('reconnect grace creates one computer takeover and restores the human at a safe boundary', () => {
  let now = Date.parse('2026-09-17T12:00:00.000Z');
  let id = 0;
  const db = openDatabase(':memory:');
  const service = new HuntService(db, {
    clock: () => new Date(now),
    idFactory: () => `reconnect-${++id}`,
    botSeedFactory: () => `seed-${++id}`,
  });
  try {
    const entry = service.enqueue('disconnecting-whale', {
      expectedStateVersion: 1,
      idempotencyKey: 'disconnect-queue',
      maxTracers: 1,
      role: 'whale',
      playComputersNow: true,
    });
    assert.ok(entry.matchId);
    const initial = service.getMatch(entry.matchId, 'disconnecting-whale') as HuntMatchView;
    service.disconnect(entry.matchId, 'disconnecting-whale');
    now += 15_000;
    service.resolveDeadlines(entry.matchId);
    const substituted = readHuntParticipants(db, entry.matchId).find(
      (participant) => participant.participant_id === 'disconnecting-whale',
    )!;
    assert.equal(substituted.kind, 'computer');
    assert.equal(substituted.connection, 'substituted');
    const events = readHuntEvents(db, entry.matchId);
    assert.equal(events.filter((event) => event.kind === 'participant-substituted').length, 1);
    assert.equal(initial.phase, 'setup');
    const afterBot = service.getMatch(entry.matchId, 'disconnecting-whale') as HuntMatchView;
    assert.notEqual(afterBot.phase, 'setup');
    const restored = service.reconnect(entry.matchId, 'disconnecting-whale');
    const current = readHuntParticipants(db, entry.matchId).find(
      (participant) => participant.participant_id === 'disconnecting-whale',
    )!;
    assert.equal(current.kind, 'human');
    assert.equal(current.connection, 'connected');
    assert.equal(restored.reconnect.canReconnect, true);
    assert.equal(
      readHuntEvents(db, entry.matchId).filter((event) => event.kind === 'participant-substituted')
        .length,
      1,
    );
  } finally {
    db.close();
  }
});

test('a restarted service resolves an overdue reconnect once from persisted deadlines', () => {
  let now = Date.parse('2026-09-17T12:00:00.000Z');
  const databasePath = join(mkdtempSync(join(tmpdir(), 'whale-hunt-restart-')), 'hunt.sqlite');
  let id = 0;
  const firstDb = openDatabase(databasePath);
  const first = new HuntService(firstDb, {
    clock: () => new Date(now),
    idFactory: () => `restart-${++id}`,
    botSeedFactory: () => `restart-seed-${++id}`,
  });
  const entry = first.enqueue('restart-whale', {
    expectedStateVersion: 1,
    idempotencyKey: 'restart-queue',
    maxTracers: 1,
    role: 'whale',
    playComputersNow: true,
  });
  assert.ok(entry.matchId);
  first.disconnect(entry.matchId, 'restart-whale');
  firstDb.close();

  now += 15_000;
  const secondDb = openDatabase(databasePath);
  const second = new HuntService(secondDb, {
    clock: () => new Date(now),
    idFactory: () => `restart-second-${++id}`,
    botSeedFactory: () => `restart-second-seed-${++id}`,
  });
  try {
    second.resolveDeadlines(entry.matchId);
    second.resolveDeadlines(entry.matchId);
    const participant = readHuntParticipants(secondDb, entry.matchId).find(
      (item) => item.participant_id === 'restart-whale',
    )!;
    assert.equal(participant.kind, 'computer');
    assert.equal(
      readHuntEvents(secondDb, entry.matchId).filter(
        (event) => event.kind === 'participant-substituted',
      ).length,
      1,
    );
  } finally {
    secondDb.close();
  }
});
