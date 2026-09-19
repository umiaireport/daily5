import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './store.js';

export type DailySettlementSourceKind = 'synthetic' | 'nansen';
export interface DailySettlementSource {
  challengeId: string;
  assetId: string;
  kind: DailySettlementSourceKind;
  chain: string | null;
  tokenAddress: string | null;
  entryPrice: number;
  fallbackExitPrice: number | null;
}
export interface PendingDailyChallenge {
  id: string;
  payload: string;
}

/** Additive daily tables; call after openDatabase before HTTP or worker use. */
export function initializeDailyDatabase(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_challenges (
      id TEXT PRIMARY KEY, payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','settled','void')),
      settlement TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_entries (
      challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
      session_id TEXT NOT NULL REFERENCES sessions(id),
      weights TEXT NOT NULL, locked_at TEXT NOT NULL, result TEXT,
      PRIMARY KEY(challenge_id,session_id)
    );
    CREATE TABLE IF NOT EXISTS daily_job_leases (
      name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_settlement_sources (
      challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
      asset_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('synthetic','nansen')),
      chain TEXT,
      token_address TEXT,
      entry_price REAL NOT NULL,
      fallback_exit_price REAL,
      PRIMARY KEY(challenge_id,asset_id)
    );
  `);
}

/** Registers private settlement references; the HTTP challenge payload never includes these. */
export function registerDailySettlementSources(
  db: DatabaseSync,
  challengeId: string,
  sources: Omit<DailySettlementSource, 'challengeId'>[],
): void {
  if (
    !challengeId.trim() ||
    sources.length !== 3 ||
    new Set(sources.map((source) => source.assetId)).size !== 3
  )
    throw new Error('A daily challenge needs three distinct settlement sources.');
  for (const source of sources) {
    if (
      !source.assetId.trim() ||
      !['synthetic', 'nansen'].includes(source.kind) ||
      !Number.isFinite(source.entryPrice) ||
      source.entryPrice <= 0 ||
      (source.fallbackExitPrice !== null &&
        (!Number.isFinite(source.fallbackExitPrice) || source.fallbackExitPrice <= 0)) ||
      (source.kind === 'nansen' && (!source.chain?.trim() || !source.tokenAddress?.trim())) ||
      (source.kind === 'synthetic' && source.fallbackExitPrice === null)
    )
      throw new Error('Daily settlement sources must contain valid private price references.');
  }
  transaction(db, () => {
    for (const source of sources) {
      const existing = db
        .prepare(
          'SELECT kind,chain,token_address,entry_price,fallback_exit_price FROM daily_settlement_sources WHERE challenge_id=? AND asset_id=?',
        )
        .get(challengeId, source.assetId) as
        | {
            kind: DailySettlementSourceKind;
            chain: string | null;
            token_address: string | null;
            entry_price: number;
            fallback_exit_price: number | null;
          }
        | undefined;
      if (existing) {
        if (
          existing.kind !== source.kind ||
          existing.chain !== source.chain ||
          existing.token_address !== source.tokenAddress ||
          existing.entry_price !== source.entryPrice ||
          existing.fallback_exit_price !== source.fallbackExitPrice
        )
          throw new Error('Daily settlement sources are immutable.');
        continue;
      }
      db.prepare(
        `INSERT INTO daily_settlement_sources
          (challenge_id,asset_id,kind,chain,token_address,entry_price,fallback_exit_price)
          VALUES(?,?,?,?,?,?,?)`,
      ).run(
        challengeId,
        source.assetId,
        source.kind,
        source.chain,
        source.tokenAddress,
        source.entryPrice,
        source.fallbackExitPrice,
      );
    }
  });
}

/** Reads private sources for the settlement worker only. Never call this from an HTTP route. */
export function dailySettlementSources(
  db: DatabaseSync,
  challengeId: string,
): DailySettlementSource[] {
  return db
    .prepare(
      'SELECT challenge_id,asset_id,kind,chain,token_address,entry_price,fallback_exit_price FROM daily_settlement_sources WHERE challenge_id=? ORDER BY asset_id',
    )
    .all(challengeId)
    .map((row) => {
      const source = row as unknown as {
        challenge_id: string;
        asset_id: string;
        kind: DailySettlementSourceKind;
        chain: string | null;
        token_address: string | null;
        entry_price: number;
        fallback_exit_price: number | null;
      };
      return {
        challengeId: source.challenge_id,
        assetId: source.asset_id,
        kind: source.kind,
        chain: source.chain,
        tokenAddress: source.token_address,
        entryPrice: source.entry_price,
        fallbackExitPrice: source.fallback_exit_price,
      };
    });
}

/** Lists lifecycle-pending challenges for the private settlement worker. */
export function pendingDailyChallenges(db: DatabaseSync): PendingDailyChallenge[] {
  return db
    .prepare("SELECT id,payload FROM daily_challenges WHERE status='pending' ORDER BY id")
    .all()
    .map((row) => row as unknown as PendingDailyChallenge);
}

/** An owner can renew an unclaimed lease or its own lease with one atomic write. */
export function acquireDailyLease(
  db: DatabaseSync,
  name: string,
  owner: string,
  durationMs: number,
  now = new Date(),
): boolean {
  const timestamp = now.getTime();
  if (
    !name.trim() ||
    !owner.trim() ||
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    !Number.isSafeInteger(timestamp + durationMs)
  ) {
    throw new Error('Lease name, owner, valid clock, and positive duration are required.');
  }
  return (
    db
      .prepare(
        `INSERT INTO daily_job_leases(name,owner,expires_at) VALUES(?,?,?)
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
    WHERE daily_job_leases.owner=excluded.owner OR daily_job_leases.expires_at<=?`,
      )
      .run(name, owner, timestamp + durationMs, timestamp).changes === 1
  );
}

export function releaseDailyLease(db: DatabaseSync, name: string, owner: string): boolean {
  return (
    db.prepare('DELETE FROM daily_job_leases WHERE name=? AND owner=?').run(name, owner).changes ===
    1
  );
}
