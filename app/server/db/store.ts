import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { initializeDailyFiveDatabase } from './daily-five.js';
import { initializeAuthDatabase } from './auth.js';

export const SCHEMA_VERSION = 1;

/** Initializes the Daily5 tables used by the API and local tools. */
export function initializeGameDatabases(db: DatabaseSync): void {
  initializeDailyFiveDatabase(db);
  initializeAuthDatabase(db);
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
    .user_version;
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error('This database requires a newer Daily5 release.');
  }
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    transaction(db, () => {
      const migrationVersion = (db.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version;
      if (migrationVersion > SCHEMA_VERSION)
        throw new Error('This database requires a newer Daily5 release.');
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
