import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { initializeDailyDatabase } from './daily.js';
import { initializeDailyFiveDatabase } from './daily-five.js';
import { initializeHuntDatabase } from './hunt.js';
import { initializeHuntV2Database } from './hunt-v2.js';
import { initializeMatchmakingDatabase } from '../matchmaking/store.js';
import { initializeProgressionDatabase } from './progression.js';
import { initializeAuthDatabase } from './auth.js';

export const SCHEMA_VERSION = 3;

/** Ordered additive migrations shared by the API, worker, and migration CLI. */
export function initializeGameDatabases(db: DatabaseSync): void {
  initializeDailyDatabase(db);
  initializeDailyFiveDatabase(db);
  initializeHuntDatabase(db);
  initializeHuntV2Database(db);
  initializeMatchmakingDatabase(db);
  initializeProgressionDatabase(db);
  initializeAuthDatabase(db);
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
    .user_version;
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error('This database requires a newer Whale Arena release.');
  }
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    transaction(db, () => {
      const migrationVersion = (db.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version;
      if (migrationVersion > SCHEMA_VERSION)
        throw new Error('This database requires a newer Whale Arena release.');
      db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS card_unlocks (session_id TEXT NOT NULL REFERENCES sessions(id), scenario_id TEXT NOT NULL, asset_id TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(session_id, scenario_id, asset_id, kind));
    CREATE TABLE IF NOT EXISTS choices (session_id TEXT NOT NULL REFERENCES sessions(id), scenario_id TEXT NOT NULL, weights TEXT NOT NULL, result TEXT NOT NULL, locked_at TEXT NOT NULL, PRIMARY KEY(session_id, scenario_id));
    CREATE TABLE IF NOT EXISTS job_leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS round_reviews (session_id TEXT NOT NULL, scenario_id TEXT NOT NULL, reviewed_at TEXT NOT NULL, PRIMARY KEY(session_id, scenario_id), FOREIGN KEY(session_id,scenario_id) REFERENCES choices(session_id,scenario_id));`);
      if (migrationVersion < 2) {
        // Existing installations advanced immediately after a choice. Preserve their progress.
        db.exec(
          'INSERT OR IGNORE INTO round_reviews SELECT session_id,scenario_id,locked_at FROM choices',
        );
      }
      db.exec(`PRAGMA user_version=${SCHEMA_VERSION}`);
    });
  } catch (error) {
    db.close();
    throw error;
  }
  initializeGameDatabases(db);
  return db;
}

export function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = action();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
