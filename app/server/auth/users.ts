import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { transaction } from '../db/store.js';

const PASSWORD_HASH_ALGORITHM = 'scrypt';
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SESSION_DAYS = 30;

export interface AuthUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
}

interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly password_hash: string;
  readonly created_at: string;
  readonly last_login_at: string | null;
}

export class AuthConflictError extends Error {
  constructor(message = 'That username is already in use.') {
    super(message);
    this.name = 'AuthConflictError';
  }
}

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthValidationError';
  }
}

function now(): string {
  return new Date().toISOString();
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

/** Hashes a password with a per-user salt; the plaintext is never stored. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [PASSWORD_HASH_ALGORITHM, SCRYPT_N, SCRYPT_R, SCRYPT_P, encode(salt), encode(digest)].join(
    '$',
  );
}

function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, nValue, rValue, pValue, saltValue, digestValue] = stored.split('$');
  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    !nValue ||
    !rValue ||
    !pValue ||
    !saltValue ||
    !digestValue
  )
    return false;
  try {
    const expected = decode(digestValue);
    const actual = scryptSync(password, decode(saltValue), expected.length, {
      N: Number(nValue),
      r: Number(rValue),
      p: Number(pValue),
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function publicUser(row: Pick<UserRow, 'id' | 'username' | 'display_name'>): AuthUser {
  return { id: row.id, username: row.username, displayName: row.display_name };
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateRegistration(
  username: string,
  password: string,
  displayName: string,
): void {
  if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username))
    throw new AuthValidationError(
      'Username must be 3–40 characters and use letters, numbers, dots, hyphens, or underscores.',
    );
  if (password.length < 8 || password.length > 80)
    throw new AuthValidationError('Password must be between 8 and 80 characters.');
  if (displayName.length < 1 || displayName.length > 60)
    throw new AuthValidationError('Display name must be between 1 and 60 characters.');
}

/** Ensures the documented demo account exists in every new database. */
export function ensureDemoUser(db: DatabaseSync): void {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
  if (existing) return;
  db.prepare(
    'INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run('demo', 'demo', 'demo', hashPassword('demo'), now());
}

export function registerUser(
  db: DatabaseSync,
  usernameInput: string,
  password: string,
  displayNameInput?: string,
): AuthUser {
  const username = normalizeUsername(usernameInput);
  const displayName = (displayNameInput?.trim() || username).slice(0, 60);
  validateRegistration(username, password, displayName);
  const user = {
    id: randomUUID(),
    username,
    displayName,
    passwordHash: hashPassword(password),
    createdAt: now(),
  };
  try {
    transaction(db, () => {
      db.prepare(
        'INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(user.id, user.username, user.displayName, user.passwordHash, user.createdAt);
    });
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) throw new AuthConflictError();
    throw error;
  }
  return { id: user.id, username: user.username, displayName: user.displayName };
}

export function authenticateUser(
  db: DatabaseSync,
  usernameInput: string,
  password: string,
): AuthUser | null {
  const row = db
    .prepare(
      'SELECT id, username, display_name, password_hash, created_at, last_login_at FROM users WHERE username = ?',
    )
    .get(normalizeUsername(usernameInput)) as UserRow | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), row.id);
  return publicUser(row);
}

export function userById(db: DatabaseSync, id: string): AuthUser | null {
  const row = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(id) as
    Pick<UserRow, 'id' | 'username' | 'display_name'> | undefined;
  return row ? publicUser(row) : null;
}

export function createAuthSession(db: DatabaseSync, userId: string): string {
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 86_400_000);
  db.prepare(
    'INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(id, userId, createdAt.toISOString(), expiresAt.toISOString());
  return id;
}

export function userByAuthSession(
  db: DatabaseSync,
  sessionId: string | undefined,
): AuthUser | null {
  if (!sessionId) return null;
  const row = db
    .prepare(
      `SELECT users.id, users.username, users.display_name
       FROM auth_sessions
       JOIN users ON users.id = auth_sessions.user_id
       WHERE auth_sessions.id = ? AND auth_sessions.expires_at > ?`,
    )
    .get(sessionId, now()) as Pick<UserRow, 'id' | 'username' | 'display_name'> | undefined;
  return row ? publicUser(row) : null;
}

export function deleteAuthSession(db: DatabaseSync, sessionId: string | undefined): void {
  if (sessionId) db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(sessionId);
}
