import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './store.js';

export type ProgressionDailyMode = 'official' | 'practice';
export type ProgressionHuntRole = 'whale' | 'tracer' | 'captain';
export type ProgressionMatchKind = 'human' | 'computer' | 'substituted';

export interface ProgressionDailyRow {
  readonly attempt_id: string;
  readonly player_id: string;
  readonly daily_id: string;
  readonly mode: ProgressionDailyMode;
  readonly completed_at: string;
  readonly equity: string;
  readonly return_pct: string;
  readonly rules_version: 'daily-five-v1' | 'daily-five-v2';
  readonly variant_id: string;
  readonly cohort_id: string;
  readonly correct_directions: number;
  readonly directional_trades: number;
  readonly finalized_payload: string;
  readonly created_at: string;
}

export interface ProgressionHuntRow {
  readonly match_id: string;
  readonly player_id: string;
  readonly completed_at: string;
  readonly role: ProgressionHuntRole;
  readonly won: number;
  readonly rules_version: 'hunt-v1';
  readonly match_kind: ProgressionMatchKind;
  readonly max_tracers: 1 | 5;
  readonly final_pair_correct: number;
  readonly correct_pair_before_final: number;
  readonly final_includes_decoy: number;
  readonly finalized_payload: string;
  readonly created_at: string;
}

export interface ProgressionBadgeRow {
  readonly player_id: string;
  readonly badge_id: string;
  readonly earned_at: string;
}

export interface ProgressionShareRow {
  readonly share_id: string;
  readonly owner_player_id: string;
  readonly activity: 'daily-five' | 'hunt';
  readonly created_at: string;
  readonly public_payload: string;
  readonly target_match_id: string | null;
  readonly role_swap: number;
  readonly practice_only: number;
}

function migrateDailyRulesConstraint(db: DatabaseSync): void {
  const table = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='progression_daily_results'",
    )
    .get() as { sql?: string } | undefined;
  const sql = table?.sql ?? '';
  if (!sql.includes('daily-five-v1') || sql.includes('daily-five-v2')) return;
  transaction(db, () => {
    db.exec(`
      DROP INDEX IF EXISTS progression_daily_official_per_day;
      DROP INDEX IF EXISTS progression_daily_comparison;
      DROP INDEX IF EXISTS progression_daily_player_history;
      ALTER TABLE progression_daily_results RENAME TO progression_daily_results_v1_legacy;
      CREATE TABLE progression_daily_results (
        attempt_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        daily_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('official','practice')),
        completed_at TEXT NOT NULL,
        equity TEXT NOT NULL,
        return_pct TEXT NOT NULL,
        rules_version TEXT NOT NULL CHECK(rules_version IN ('daily-five-v1','daily-five-v2')),
        variant_id TEXT NOT NULL,
        cohort_id TEXT NOT NULL,
        correct_directions INTEGER NOT NULL CHECK(correct_directions >= 0),
        directional_trades INTEGER NOT NULL CHECK(directional_trades >= 0),
        finalized_payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO progression_daily_results
        (attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
         variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at)
      SELECT attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
        variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at
      FROM progression_daily_results_v1_legacy;
      DROP TABLE progression_daily_results_v1_legacy;
    `);
  });
}

/** Creates additive progression records without changing legacy tables or schema versioning. */
export function initializeProgressionDatabase(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS progression_daily_results (
      attempt_id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      daily_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('official','practice')),
      completed_at TEXT NOT NULL,
      equity TEXT NOT NULL,
      return_pct TEXT NOT NULL,
      rules_version TEXT NOT NULL CHECK(rules_version IN ('daily-five-v1','daily-five-v2')),
      variant_id TEXT NOT NULL,
      cohort_id TEXT NOT NULL,
      correct_directions INTEGER NOT NULL CHECK(correct_directions >= 0),
      directional_trades INTEGER NOT NULL CHECK(directional_trades >= 0),
      finalized_payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS progression_daily_official_per_day
      ON progression_daily_results(player_id, daily_id) WHERE mode='official';
    CREATE INDEX IF NOT EXISTS progression_daily_comparison
      ON progression_daily_results(mode, daily_id, variant_id, cohort_id, equity);
    CREATE INDEX IF NOT EXISTS progression_daily_player_history
      ON progression_daily_results(player_id, mode, completed_at DESC);
    CREATE TABLE IF NOT EXISTS progression_hunt_results (
      match_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('whale','tracer','captain')),
      won INTEGER NOT NULL CHECK(won IN (0,1)),
      rules_version TEXT NOT NULL CHECK(rules_version='hunt-v1'),
      match_kind TEXT NOT NULL CHECK(match_kind IN ('human','computer','substituted')),
      max_tracers INTEGER NOT NULL CHECK(max_tracers IN (1,5)),
      final_pair_correct INTEGER NOT NULL CHECK(final_pair_correct IN (0,1)),
      correct_pair_before_final INTEGER NOT NULL CHECK(correct_pair_before_final IN (0,1)),
      final_includes_decoy INTEGER NOT NULL CHECK(final_includes_decoy IN (0,1)),
      finalized_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(match_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS progression_hunt_player_history
      ON progression_hunt_results(player_id, completed_at DESC);
    CREATE TABLE IF NOT EXISTS progression_badges (
      player_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      PRIMARY KEY(player_id, badge_id)
    );
    CREATE TABLE IF NOT EXISTS progression_shares (
      share_id TEXT PRIMARY KEY,
      owner_player_id TEXT NOT NULL,
      activity TEXT NOT NULL CHECK(activity IN ('daily-five','hunt')),
      created_at TEXT NOT NULL,
      public_payload TEXT NOT NULL,
      target_match_id TEXT,
      role_swap INTEGER NOT NULL CHECK(role_swap IN (0,1)),
      practice_only INTEGER NOT NULL CHECK(practice_only IN (0,1))
    );
  `);
  migrateDailyRulesConstraint(db);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS progression_daily_official_per_day
      ON progression_daily_results(player_id, daily_id) WHERE mode='official';
    CREATE INDEX IF NOT EXISTS progression_daily_comparison
      ON progression_daily_results(mode, daily_id, variant_id, cohort_id, equity);
    CREATE INDEX IF NOT EXISTS progression_daily_player_history
      ON progression_daily_results(player_id, mode, completed_at DESC);
  `);
}

/** Startup migration alias for the coordinator's ordered additive migrations. */
export const migrateProgressionDatabase = initializeProgressionDatabase;

/** Reads one saved Daily Five completion by its idempotent attempt identity. */
export function readProgressionDailyResult(
  db: DatabaseSync,
  attemptId: string,
): ProgressionDailyRow | undefined {
  return db
    .prepare(
      `SELECT attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
              variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at
       FROM progression_daily_results WHERE attempt_id=?`,
    )
    .get(attemptId) as unknown as ProgressionDailyRow | undefined;
}

/** Reads one player's saved completion for a daily and mode. */
export function readProgressionDailyForDay(
  db: DatabaseSync,
  playerId: string,
  dailyId: string,
  mode: ProgressionDailyMode,
): ProgressionDailyRow | undefined {
  return db
    .prepare(
      `SELECT attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
              variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at
       FROM progression_daily_results WHERE player_id=? AND daily_id=? AND mode=?`,
    )
    .get(playerId, dailyId, mode) as unknown as ProgressionDailyRow | undefined;
}

/** Lists a player's finalized Daily Five results with practice rows available to internal callers. */
export function readProgressionDailyResults(
  db: DatabaseSync,
  playerId: string,
  mode?: ProgressionDailyMode,
): ProgressionDailyRow[] {
  const query = mode
    ? `SELECT attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
              variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at
       FROM progression_daily_results WHERE player_id=? AND mode=?
       ORDER BY completed_at DESC,attempt_id`
    : `SELECT attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
              variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at
       FROM progression_daily_results WHERE player_id=?
       ORDER BY completed_at DESC,attempt_id`;
  return (mode
    ? db.prepare(query).all(playerId, mode)
    : db.prepare(query).all(playerId)) as unknown as ProgressionDailyRow[];
}

/** Lists official Daily Five results for one exact variant or cohort comparison. */
export function readProgressionDailyComparison(
  db: DatabaseSync,
  input: { readonly dailyId: string; readonly variantId?: string; readonly cohortId?: string },
): ProgressionDailyRow[] {
  if (input.variantId !== undefined)
    return db
      .prepare(
        `SELECT attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
                variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at
         FROM progression_daily_results
         WHERE mode='official' AND daily_id=? AND variant_id=?
         ORDER BY completed_at,attempt_id`,
      )
      .all(input.dailyId, input.variantId) as unknown as ProgressionDailyRow[];
  if (input.cohortId !== undefined)
    return db
      .prepare(
        `SELECT attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
                variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at
         FROM progression_daily_results
         WHERE mode='official' AND daily_id=? AND cohort_id=?
         ORDER BY completed_at,attempt_id`,
      )
      .all(input.dailyId, input.cohortId) as unknown as ProgressionDailyRow[];
  return [];
}

/** Inserts one finalized Daily Five row; callers must wrap related awards in one transaction. */
export function insertProgressionDailyResult(db: DatabaseSync, row: ProgressionDailyRow): void {
  db.prepare(
    `INSERT INTO progression_daily_results
      (attempt_id,player_id,daily_id,mode,completed_at,equity,return_pct,rules_version,
       variant_id,cohort_id,correct_directions,directional_trades,finalized_payload,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.attempt_id,
    row.player_id,
    row.daily_id,
    row.mode,
    row.completed_at,
    row.equity,
    row.return_pct,
    row.rules_version,
    row.variant_id,
    row.cohort_id,
    row.correct_directions,
    row.directional_trades,
    row.finalized_payload,
    row.created_at,
  );
}

/** Reads one saved Hunt completion for idempotency and conflict detection. */
export function readProgressionHuntResult(
  db: DatabaseSync,
  matchId: string,
  playerId: string,
): ProgressionHuntRow | undefined {
  return db
    .prepare(
      `SELECT match_id,player_id,completed_at,role,won,rules_version,match_kind,max_tracers,
              final_pair_correct,correct_pair_before_final,final_includes_decoy,finalized_payload,created_at
       FROM progression_hunt_results WHERE match_id=? AND player_id=?`,
    )
    .get(matchId, playerId) as unknown as ProgressionHuntRow | undefined;
}

/** Lists a player's finalized Hunt rows, preserving each role record separately. */
export function readProgressionHuntResults(
  db: DatabaseSync,
  playerId: string,
): ProgressionHuntRow[] {
  return db
    .prepare(
      `SELECT match_id,player_id,completed_at,role,won,rules_version,match_kind,max_tracers,
              final_pair_correct,correct_pair_before_final,final_includes_decoy,finalized_payload,created_at
       FROM progression_hunt_results WHERE player_id=?
       ORDER BY completed_at DESC,match_id`,
    )
    .all(playerId) as unknown as ProgressionHuntRow[];
}

/** Inserts one finalized Hunt row; uniqueness makes repeated settlement harmless. */
export function insertProgressionHuntResult(db: DatabaseSync, row: ProgressionHuntRow): void {
  db.prepare(
    `INSERT INTO progression_hunt_results
      (match_id,player_id,completed_at,role,won,rules_version,match_kind,max_tracers,
       final_pair_correct,correct_pair_before_final,final_includes_decoy,finalized_payload,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.match_id,
    row.player_id,
    row.completed_at,
    row.role,
    row.won,
    row.rules_version,
    row.match_kind,
    row.max_tracers,
    row.final_pair_correct,
    row.correct_pair_before_final,
    row.final_includes_decoy,
    row.finalized_payload,
    row.created_at,
  );
}

/** Lists a player's unique cosmetic awards in earned order. */
export function readProgressionBadges(db: DatabaseSync, playerId: string): ProgressionBadgeRow[] {
  return db
    .prepare(
      'SELECT player_id,badge_id,earned_at FROM progression_badges WHERE player_id=? ORDER BY earned_at,badge_id',
    )
    .all(playerId) as unknown as ProgressionBadgeRow[];
}

/** Awards one badge exactly once and returns whether this call inserted it. */
export function insertProgressionBadge(db: DatabaseSync, row: ProgressionBadgeRow): boolean {
  return (
    db
      .prepare(
        'INSERT OR IGNORE INTO progression_badges(player_id,badge_id,earned_at) VALUES(?,?,?)',
      )
      .run(row.player_id, row.badge_id, row.earned_at).changes === 1
  );
}

/** Stores a sanitized opaque friend/rematch share payload. */
export function insertProgressionShare(db: DatabaseSync, row: ProgressionShareRow): void {
  db.prepare(
    `INSERT INTO progression_shares
      (share_id,owner_player_id,activity,created_at,public_payload,target_match_id,role_swap,practice_only)
     VALUES(?,?,?,?,?,?,?,?)`,
  ).run(
    row.share_id,
    row.owner_player_id,
    row.activity,
    row.created_at,
    row.public_payload,
    row.target_match_id,
    row.role_swap,
    row.practice_only,
  );
}

/** Reads a share by opaque id; no answer mapping is included in this record. */
export function readProgressionShare(
  db: DatabaseSync,
  shareId: string,
): ProgressionShareRow | undefined {
  return db
    .prepare(
      `SELECT share_id,owner_player_id,activity,created_at,public_payload,target_match_id,
              role_swap,practice_only
       FROM progression_shares WHERE share_id=?`,
    )
    .get(shareId) as unknown as ProgressionShareRow | undefined;
}

/** Runs one progression mutation with records and awards committed together. */
export function progressionTransaction<T>(db: DatabaseSync, action: () => T): T {
  return transaction(db, action);
}
