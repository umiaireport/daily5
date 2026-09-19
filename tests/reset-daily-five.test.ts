import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db/store.js';
import { DailyFiveEngine } from '../server/domain/daily-five/index.js';
import { resetDailyFiveState } from '../server/db/daily-five.js';

test('Daily Five reset clears attempts and projections but preserves the case pack and sessions', () => {
  const db = openDatabase(':memory:');
  try {
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
    db.prepare('INSERT INTO sessions(id,name,created_at) VALUES(?,?,?)').run(
      'session-1',
      'Developer',
      '2026-09-18T00:00:00.000Z',
    );
    const engine = new DailyFiveEngine(db, () => new Date('2026-09-18T12:00:00.000Z'));
    const day = engine.today();
    const attempt = engine.start(day.dailyId, 'session-1', { idempotencyKey: 'start' });
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
    db.prepare(
      `INSERT INTO progression_daily_results
       (attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
        variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      attempt.attemptId,
      'session-1',
      day.dailyId,
      'official',
      '2026-09-18T12:00:00.000Z',
      '50000.00',
      '0.00',
      'daily-five-v2',
      'variant-1',
      'synthetic-cohort',
      0,
      0,
      '{}',
      '2026-09-18T12:00:00.000Z',
    );
    db.prepare('INSERT INTO progression_badges(player_id,badge_id,earned_at) VALUES(?,?,?)').run(
      'session-1',
      'first-five',
      '2026-09-18T12:00:00.000Z',
    );
    db.prepare(
      `INSERT INTO progression_shares
       (share_id,owner_player_id,activity,created_at,public_payload,target_match_id,role_swap,practice_only)
       VALUES(?,?,?,?,?,?,?,?)`,
    ).run('share-1', 'session-1', 'daily-five', '2026-09-18T12:00:00.000Z', '{}', null, 0, 0);

    assert.deepEqual(resetDailyFiveState(db), {
      attempts: 1,
      clues: 1,
      tickets: 1,
      commands: 1,
      startCommands: 1,
      reviews: 1,
      progressionResults: 1,
      progressionBadges: 1,
      progressionShares: 1,
    });
    assert.equal(count('daily_five_days'), 1);
    assert.equal(count('sessions'), 1);
    assert.equal(count('daily_five_attempts'), 0);
    assert.equal(count('progression_daily_results'), 0);
  } finally {
    db.close();
  }
});
