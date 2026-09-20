import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db/store.js';
import { resetDailyFiveState } from '../server/db/daily-five.js';
import { DailyFiveEngine } from '../server/domain/daily-five/index.js';

test('Daily5 reset clears attempts and clues while preserving the published case pack', () => {
  const db = openDatabase(':memory:');
  try {
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
    const engine = new DailyFiveEngine(db, () => new Date('2026-09-18T12:00:00.000Z'));
    const day = engine.today();
    const attempt = engine.start(day.dailyId, 'reset-player', { idempotencyKey: 'start' });
    db.prepare(
      'INSERT INTO daily_five_clues(attempt_id,round_index,clue_id,unlocked_at) VALUES(?,?,?,?)',
    ).run(attempt.attemptId, 1, 'clue-1', '2026-09-18T12:00:00.000Z');
    db.prepare(
      'INSERT INTO daily_five_tickets(attempt_id,round_index,command,result,locked_at) VALUES(?,?,?,?,?)',
    ).run(attempt.attemptId, 1, '{}', '{}', '2026-09-18T12:00:00.000Z');
    db.prepare(
      'INSERT INTO daily_five_commands(attempt_id,idempotency_key,kind,payload,response,created_at) VALUES(?,?,?,?,?,?)',
    ).run(attempt.attemptId, 'ticket', 'cash', '{}', '{}', '2026-09-18T12:00:00.000Z');
    db.prepare(
      'INSERT INTO daily_five_reviews(attempt_id,round_index,reviewed_at) VALUES(?,?,?)',
    ).run(attempt.attemptId, 1, '2026-09-18T12:00:00.000Z');

    assert.deepEqual(resetDailyFiveState(db), {
      attempts: 1,
      clues: 1,
      tickets: 1,
      commands: 1,
      startCommands: 1,
      reviews: 1,
    });
    assert.equal(count('daily_five_days'), 1);
    assert.equal(count('daily_five_attempts'), 0);
    assert.equal(count('daily_five_clues'), 0);
  } finally {
    db.close();
  }
});
