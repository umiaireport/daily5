import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './store.js';

export type DailyFiveAttemptMode = 'official' | 'practice';
export type DailyFiveAttemptPhase = 'round-open' | 'saved-result' | 'final-result';

export interface DailyFiveDayRow {
  daily_id: string;
  public_payload: string;
  private_payload: string;
  cohort: string;
  published_at: string;
}

export interface DailyFiveAttemptRow {
  attempt_id: string;
  daily_id: string;
  player_id: string;
  mode: DailyFiveAttemptMode;
  phase: DailyFiveAttemptPhase;
  state_version: number;
  current_round_index: number | null;
  assignments: string;
  final_result: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DailyFiveCommandRow {
  attempt_id: string;
  idempotency_key: string;
  kind: string;
  payload: string;
  response: string;
}

export interface DailyFiveStartCommandRow {
  daily_id: string;
  player_id: string;
  idempotency_key: string;
  payload: string;
  attempt_id: string;
  response: string;
}

export interface DailyFiveTicketRow {
  attempt_id: string;
  round_index: number;
  command: string;
  result: string;
  locked_at: string;
}

/** Creates the additive Daily Five tables and indexes without touching legacy records. */
export function initializeDailyFiveDatabase(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_five_days (
      daily_id TEXT PRIMARY KEY,
      public_payload TEXT NOT NULL,
      private_payload TEXT NOT NULL,
      cohort TEXT NOT NULL,
      published_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_five_attempts (
      attempt_id TEXT PRIMARY KEY,
      daily_id TEXT NOT NULL REFERENCES daily_five_days(daily_id),
      player_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('official','practice')),
      phase TEXT NOT NULL CHECK(phase IN ('round-open','saved-result','final-result')),
      state_version INTEGER NOT NULL,
      current_round_index INTEGER,
      assignments TEXT NOT NULL,
      final_result TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS daily_five_official_attempt
      ON daily_five_attempts(daily_id, player_id) WHERE mode='official';
    CREATE INDEX IF NOT EXISTS daily_five_attempts_by_day
      ON daily_five_attempts(daily_id, mode, completed_at);
    CREATE TABLE IF NOT EXISTS daily_five_clues (
      attempt_id TEXT NOT NULL REFERENCES daily_five_attempts(attempt_id),
      round_index INTEGER NOT NULL,
      clue_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY(attempt_id, round_index, clue_id)
    );
    CREATE TABLE IF NOT EXISTS daily_five_tickets (
      attempt_id TEXT NOT NULL REFERENCES daily_five_attempts(attempt_id),
      round_index INTEGER NOT NULL,
      command TEXT NOT NULL,
      result TEXT NOT NULL,
      locked_at TEXT NOT NULL,
      PRIMARY KEY(attempt_id, round_index)
    );
    CREATE TABLE IF NOT EXISTS daily_five_commands (
      attempt_id TEXT NOT NULL REFERENCES daily_five_attempts(attempt_id),
      idempotency_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(attempt_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS daily_five_start_commands (
      daily_id TEXT NOT NULL REFERENCES daily_five_days(daily_id),
      player_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempt_id TEXT NOT NULL REFERENCES daily_five_attempts(attempt_id),
      response TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(daily_id, player_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS daily_five_reviews (
      attempt_id TEXT NOT NULL REFERENCES daily_five_attempts(attempt_id),
      round_index INTEGER NOT NULL,
      reviewed_at TEXT NOT NULL,
      PRIMARY KEY(attempt_id, round_index)
    );
  `);
}

/** Migration entrypoint used by startup ordering; it is intentionally additive and idempotent. */
export const migrateDailyFiveDatabase = initializeDailyFiveDatabase;

export interface DailyFiveResetCounts {
  readonly attempts: number;
  readonly clues: number;
  readonly tickets: number;
  readonly commands: number;
  readonly startCommands: number;
  readonly reviews: number;
  readonly progressionResults: number;
  readonly progressionBadges: number;
  readonly progressionShares: number;
}

function countRows(db: DatabaseSync, table: string, condition = ''): number {
  return Number(
    (
      db
        .prepare(`SELECT COUNT(*) AS count FROM ${table}${condition ? ` WHERE ${condition}` : ''}`)
        .get() as {
        count: number;
      }
    ).count,
  );
}

/** Clears local Daily Five attempts and projections while preserving published case packs. */
export function resetDailyFiveState(db: DatabaseSync): DailyFiveResetCounts {
  return transaction(db, () => {
    const counts: DailyFiveResetCounts = {
      attempts: countRows(db, 'daily_five_attempts'),
      clues: countRows(db, 'daily_five_clues'),
      tickets: countRows(db, 'daily_five_tickets'),
      commands: countRows(db, 'daily_five_commands'),
      startCommands: countRows(db, 'daily_five_start_commands'),
      reviews: countRows(db, 'daily_five_reviews'),
      progressionResults: countRows(db, 'progression_daily_results'),
      progressionBadges: countRows(
        db,
        'progression_badges',
        "badge_id IN ('first-five','clear-reading')",
      ),
      progressionShares: countRows(db, 'progression_shares', "activity='daily-five'"),
    };
    db.exec(`
      DELETE FROM daily_five_commands;
      DELETE FROM daily_five_start_commands;
      DELETE FROM daily_five_reviews;
      DELETE FROM daily_five_clues;
      DELETE FROM daily_five_tickets;
      DELETE FROM daily_five_attempts;
      DELETE FROM progression_daily_results;
      DELETE FROM progression_badges WHERE badge_id IN ('first-five','clear-reading');
      DELETE FROM progression_shares WHERE activity='daily-five';
    `);
    return counts;
  });
}

/** Reads the immutable public and private case-pack record for a published day. */
export function readDailyFiveDay(db: DatabaseSync, dailyId: string): DailyFiveDayRow | undefined {
  return db
    .prepare(
      'SELECT daily_id,public_payload,private_payload,cohort,published_at FROM daily_five_days WHERE daily_id=?',
    )
    .get(dailyId) as unknown as DailyFiveDayRow | undefined;
}

/** Publishes one immutable case pack or verifies that an existing row is identical. */
export function publishDailyFiveDay(db: DatabaseSync, row: DailyFiveDayRow): DailyFiveDayRow {
  return transaction(db, () => {
    const existing = readDailyFiveDay(db, row.daily_id);
    if (existing) {
      if (
        existing.public_payload !== row.public_payload ||
        existing.private_payload !== row.private_payload ||
        existing.cohort !== row.cohort ||
        existing.published_at !== row.published_at
      )
        throw new Error('Published Daily Five case packs are immutable.');
      return existing;
    }
    db.prepare(
      `INSERT INTO daily_five_days(daily_id,public_payload,private_payload,cohort,published_at)
       VALUES(?,?,?,?,?)`,
    ).run(row.daily_id, row.public_payload, row.private_payload, row.cohort, row.published_at);
    return row;
  });
}

/** Reads one attempt for identity and state validation. */
export function readDailyFiveAttempt(
  db: DatabaseSync,
  attemptId: string,
): DailyFiveAttemptRow | undefined {
  return db
    .prepare(
      `SELECT attempt_id,daily_id,player_id,mode,phase,state_version,current_round_index,
              assignments,final_result,created_at,completed_at
       FROM daily_five_attempts WHERE attempt_id=?`,
    )
    .get(attemptId) as unknown as DailyFiveAttemptRow | undefined;
}

/** Reads the official attempt for a player and daily challenge, if one exists. */
export function readOfficialDailyFiveAttempt(
  db: DatabaseSync,
  dailyId: string,
  playerId: string,
): DailyFiveAttemptRow | undefined {
  return db
    .prepare(
      `SELECT attempt_id,daily_id,player_id,mode,phase,state_version,current_round_index,
              assignments,final_result,created_at,completed_at
       FROM daily_five_attempts WHERE daily_id=? AND player_id=? AND mode='official'`,
    )
    .get(dailyId, playerId) as unknown as DailyFiveAttemptRow | undefined;
}

/** Finds a start response before creating another official or practice attempt. */
export function readDailyFiveStartCommand(
  db: DatabaseSync,
  dailyId: string,
  playerId: string,
  idempotencyKey: string,
): DailyFiveStartCommandRow | undefined {
  return db
    .prepare(
      `SELECT daily_id,player_id,idempotency_key,payload,attempt_id,response
       FROM daily_five_start_commands WHERE daily_id=? AND player_id=? AND idempotency_key=?`,
    )
    .get(dailyId, playerId, idempotencyKey) as unknown as DailyFiveStartCommandRow | undefined;
}

/** Stores the exact response from a successful attempt start for idempotent replay. */
export function insertDailyFiveStartCommand(
  db: DatabaseSync,
  row: DailyFiveStartCommandRow & { created_at?: string },
): void {
  db.prepare(
    `INSERT INTO daily_five_start_commands
      (daily_id,player_id,idempotency_key,payload,attempt_id,response,created_at)
      VALUES(?,?,?,?,?,?,?)`,
  ).run(
    row.daily_id,
    row.player_id,
    row.idempotency_key,
    row.payload,
    row.attempt_id,
    row.response,
    row.created_at ?? new Date().toISOString(),
  );
}

/** Inserts a new official or practice attempt with its persisted per-round assignment. */
export function insertDailyFiveAttempt(db: DatabaseSync, row: DailyFiveAttemptRow): void {
  db.prepare(
    `INSERT INTO daily_five_attempts
      (attempt_id,daily_id,player_id,mode,phase,state_version,current_round_index,assignments,final_result,created_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.attempt_id,
    row.daily_id,
    row.player_id,
    row.mode,
    row.phase,
    row.state_version,
    row.current_round_index,
    row.assignments,
    row.final_result,
    row.created_at,
    row.completed_at,
  );
}

/** Persists one state transition after its enclosing transaction validates it. */
export function updateDailyFiveAttempt(db: DatabaseSync, row: DailyFiveAttemptRow): void {
  db.prepare(
    `UPDATE daily_five_attempts
     SET phase=?,state_version=?,current_round_index=?,assignments=?,final_result=?,completed_at=?
     WHERE attempt_id=?`,
  ).run(
    row.phase,
    row.state_version,
    row.current_round_index,
    row.assignments,
    row.final_result,
    row.completed_at,
    row.attempt_id,
  );
}

/** Finds a previously stored command response for idempotent replay. */
export function readDailyFiveCommand(
  db: DatabaseSync,
  attemptId: string,
  idempotencyKey: string,
): DailyFiveCommandRow | undefined {
  return db
    .prepare(
      'SELECT attempt_id,idempotency_key,kind,payload,response FROM daily_five_commands WHERE attempt_id=? AND idempotency_key=?',
    )
    .get(attemptId, idempotencyKey) as unknown as DailyFiveCommandRow | undefined;
}

/** Stores the exact response returned by a successful mutating command. */
export function insertDailyFiveCommand(
  db: DatabaseSync,
  row: DailyFiveCommandRow & { created_at?: string },
): void {
  db.prepare(
    `INSERT INTO daily_five_commands(attempt_id,idempotency_key,kind,payload,response,created_at)
     VALUES(?,?,?,?,?,?)`,
  ).run(
    row.attempt_id,
    row.idempotency_key,
    row.kind,
    row.payload,
    row.response,
    row.created_at ?? new Date().toISOString(),
  );
}

/** Returns all saved tickets in round order for final aggregation and refresh recovery. */
export function readDailyFiveTickets(db: DatabaseSync, attemptId: string): DailyFiveTicketRow[] {
  return db
    .prepare(
      'SELECT attempt_id,round_index,command,result,locked_at FROM daily_five_tickets WHERE attempt_id=? ORDER BY round_index',
    )
    .all(attemptId) as unknown as DailyFiveTicketRow[];
}

/** Inserts one immutable round ticket; the primary key prevents double spending a round. */
export function insertDailyFiveTicket(db: DatabaseSync, row: DailyFiveTicketRow): void {
  db.prepare(
    `INSERT INTO daily_five_tickets(attempt_id,round_index,command,result,locked_at)
     VALUES(?,?,?,?,?)`,
  ).run(row.attempt_id, row.round_index, row.command, row.result, row.locked_at);
}

/** Inserts a review acknowledgment once; retries do not change the original timestamp. */
export function acknowledgeDailyFiveRound(
  db: DatabaseSync,
  attemptId: string,
  roundIndex: number,
  reviewedAt = new Date().toISOString(),
): void {
  db.prepare(
    'INSERT OR IGNORE INTO daily_five_reviews(attempt_id,round_index,reviewed_at) VALUES(?,?,?)',
  ).run(attemptId, roundIndex, reviewedAt);
}

/** Reads clue unlocks in stable order for the current public round projection. */
export function readDailyFiveClues(
  db: DatabaseSync,
  attemptId: string,
  roundIndex: number,
): string[] {
  return db
    .prepare(
      'SELECT clue_id FROM daily_five_clues WHERE attempt_id=? AND round_index=? ORDER BY clue_id',
    )
    .all(attemptId, roundIndex)
    .map((row) => (row as { clue_id: string }).clue_id);
}

/** Inserts a clue unlock exactly once and reports whether this call spent an unlock. */
export function insertDailyFiveClue(
  db: DatabaseSync,
  attemptId: string,
  roundIndex: number,
  clueId: string,
  unlockedAt = new Date().toISOString(),
): boolean {
  return (
    db
      .prepare(
        'INSERT OR IGNORE INTO daily_five_clues(attempt_id,round_index,clue_id,unlocked_at) VALUES(?,?,?,?)',
      )
      .run(attemptId, roundIndex, clueId, unlockedAt).changes === 1
  );
}

/** Lists completed final results for the daily cohort without exposing player identity. */
export function completedDailyFiveResults(
  db: DatabaseSync,
  dailyId: string,
): {
  attempt_id: string;
  daily_id: string;
  player_id: string;
  mode: DailyFiveAttemptMode;
  final_result: string;
  completed_at: string;
}[] {
  return db
    .prepare(
      `SELECT attempt_id,daily_id,player_id,mode,final_result,completed_at FROM daily_five_attempts
       WHERE daily_id=? AND phase='final-result' AND final_result IS NOT NULL
       ORDER BY completed_at,attempt_id`,
    )
    .all(dailyId) as unknown as {
    attempt_id: string;
    daily_id: string;
    player_id: string;
    mode: DailyFiveAttemptMode;
    final_result: string;
    completed_at: string;
  }[];
}

export function completedDailyFiveResultsForPlayer(
  db: DatabaseSync,
  playerId: string,
): ReturnType<typeof completedDailyFiveResults> {
  return db
    .prepare(
      `SELECT attempt_id,daily_id,player_id,mode,final_result,completed_at
       FROM daily_five_attempts
       WHERE player_id=? AND mode='official' AND phase='final-result' AND final_result IS NOT NULL
       ORDER BY completed_at DESC,attempt_id DESC`,
    )
    .all(playerId) as unknown as ReturnType<typeof completedDailyFiveResults>;
}

export function allCompletedDailyFiveResults(
  db: DatabaseSync,
): ReturnType<typeof completedDailyFiveResults> {
  return db
    .prepare(
      `SELECT attempt_id,daily_id,player_id,mode,final_result,completed_at
       FROM daily_five_attempts
       WHERE mode='official' AND phase='final-result' AND final_result IS NOT NULL
       ORDER BY completed_at DESC,attempt_id DESC`,
    )
    .all() as unknown as ReturnType<typeof completedDailyFiveResults>;
}
