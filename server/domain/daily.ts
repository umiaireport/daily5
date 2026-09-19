import type { DatabaseSync } from 'node:sqlite';
import type { Weights } from '../../shared/types.js';
import { transaction } from '../db/store.js';
import { COSTS, scoreAllocation, START_CASH, validateWeights } from './scoring.js';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface DailyRules {
  version: string;
  startCash: number;
  entryCostBps: number;
  exitCostBps: number;
}
export interface DailyChallenge<T extends JsonValue = JsonValue> {
  id: string;
  version: string;
  evidenceVersion: string;
  assetIds: [string, string, string];
  evidence: T;
  rules: DailyRules;
  opensAt: string;
  locksAt: string;
  entryAt: string;
  settleAt: string;
  voidAt: string;
}
export interface DailySettlement {
  version: string;
  prices: { assetId: string; entry: number | null; exit: number | null }[];
}
export type DailyStatus = 'pending' | 'settled' | 'void';
interface ResultBase {
  challengeId: string;
  weights: Weights;
}
export type DailyResult =
  | (ResultBase & { status: 'pending' })
  | (ResultBase & { status: 'void'; reason: string })
  | (ResultBase & {
      status: 'settled';
      settlementVersion: string;
      costVersion: string;
      startCash: number;
      endEquity: number;
      returnPct: number;
      benchmarkPct: number;
      cashPct: number;
      prices: DailySettlement['prices'];
    });
interface ChallengeRow {
  payload: string;
  status: DailyStatus;
  settlement: string | null;
}
interface EntryRow {
  session_id: string;
  weights: string;
  result: string | null;
}

/** Stable JSON permits harmless object-key reordering but rejects non-JSON evidence. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonical).join(',')}]`;
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  throw new Error('Challenge evidence must contain only finite JSON values.');
}

/** Trusted internal collector boundary, intentionally not connected to HTTP or jobs. */
export class DailyGame {
  constructor(
    private db: DatabaseSync,
    private clock: () => Date = () => new Date(),
  ) {}

  private now(): number {
    const now = this.clock().getTime();
    if (!Number.isFinite(now)) throw new Error('A valid server clock is required.');
    return now;
  }

  private row(id: string): ChallengeRow {
    const row = this.db
      .prepare('SELECT payload,status,settlement FROM daily_challenges WHERE id=?')
      .get(id) as unknown as ChallengeRow | undefined;
    if (!row) throw new Error('Daily challenge not found.');
    return row;
  }

  private assertSupportedRules(rules: DailyRules): void {
    const candidate = rules as Partial<DailyRules> | null | undefined;
    if (
      typeof candidate?.version !== 'string' ||
      !candidate.version.trim() ||
      candidate.version !== COSTS.version ||
      !Number.isFinite(candidate.startCash) ||
      !Number.isFinite(candidate.entryCostBps) ||
      !Number.isFinite(candidate.exitCostBps) ||
      candidate.startCash !== START_CASH ||
      candidate.entryCostBps !== COSTS.entry * 10_000 ||
      candidate.exitCostBps !== COSTS.exit * 10_000
    )
      throw new Error('This challenge uses an unsupported scoring rule version.');
  }

  publish<T extends JsonValue>(challenge: DailyChallenge<T>): DailyChallenge<T> {
    const payload = canonical(challenge);
    const times = [
      challenge.opensAt,
      challenge.locksAt,
      challenge.entryAt,
      challenge.settleAt,
      challenge.voidAt,
    ].map(Date.parse);
    if (
      !challenge.id.trim() ||
      !challenge.version.trim() ||
      !challenge.evidenceVersion.trim() ||
      challenge.assetIds.length !== 3 ||
      new Set(challenge.assetIds).size !== 3 ||
      challenge.assetIds.some((id) => !id.trim()) ||
      times.some((time) => !Number.isFinite(time)) ||
      !(
        times[0]! < times[1]! &&
        times[1]! <= times[2]! &&
        times[3]! >= times[2]! + 86_400_000 &&
        times[3]! < times[4]!
      )
    ) {
      throw new Error(
        'Daily challenge requires versions, three distinct assets, and ordered times with a full 24-hour settlement window.',
      );
    }
    this.assertSupportedRules(challenge.rules);
    return transaction(this.db, () => {
      const existing = this.db
        .prepare('SELECT payload FROM daily_challenges WHERE id=?')
        .get(challenge.id) as { payload: string } | undefined;
      if (existing) {
        if (existing.payload !== payload)
          throw new Error('Published challenge evidence and rules are immutable.');
      } else {
        if (this.now() >= times[1]!)
          throw new Error('Cannot publish a challenge after choices close.');
        this.db
          .prepare('INSERT INTO daily_challenges(id,payload) VALUES(?,?)')
          .run(challenge.id, payload);
      }
      return JSON.parse(payload) as DailyChallenge<T>;
    });
  }

  /** Explicitly reads only the public payload; settlement fields never leave this method. */
  challenge<T extends JsonValue = JsonValue>(id: string): DailyChallenge<T> {
    return JSON.parse(this.row(id).payload) as DailyChallenge<T>;
  }

  /** Returns the server-owned lifecycle state without exposing settlement data. */
  status(id: string): DailyStatus {
    return this.row(id).status;
  }

  enter(sessionId: string, challengeId: string, value: unknown): DailyResult {
    const weights = validateWeights(value);
    return transaction(this.db, () => {
      if (!this.db.prepare('SELECT id FROM sessions WHERE id=?').get(sessionId))
        throw new Error('A valid anonymous session is required.');
      const existing = this.db
        .prepare('SELECT weights FROM daily_entries WHERE challenge_id=? AND session_id=?')
        .get(challengeId, sessionId) as { weights: string } | undefined;
      if (existing) {
        if (existing.weights !== JSON.stringify(weights))
          throw new Error('The official daily allocation is already locked.');
        return this.result(sessionId, challengeId);
      }
      const challenge = this.challenge(challengeId);
      const now = this.now();
      if (now < Date.parse(challenge.opensAt) || now >= Date.parse(challenge.locksAt))
        throw new Error('Daily choices are outside the open window.');
      this.db
        .prepare(
          'INSERT INTO daily_entries(challenge_id,session_id,weights,locked_at) VALUES(?,?,?,?)',
        )
        .run(challengeId, sessionId, JSON.stringify(weights), new Date(now).toISOString());
      return { status: 'pending', challengeId, weights };
    });
  }

  result(sessionId: string, challengeId: string): DailyResult {
    const entry = this.db
      .prepare(
        'SELECT session_id,weights,result FROM daily_entries WHERE challenge_id=? AND session_id=?',
      )
      .get(challengeId, sessionId) as unknown as EntryRow | undefined;
    if (!entry) throw new Error('No official entry exists for this session and challenge.');
    if (entry.result) return JSON.parse(entry.result) as DailyResult;
    return { status: 'pending', challengeId, weights: JSON.parse(entry.weights) as Weights };
  }

  /** Missing prices remain pending until the fixed deadline; published results never change. */
  settle(challengeId: string, settlement: DailySettlement | null): DailyStatus {
    return transaction(this.db, () => {
      const row = this.row(challengeId);
      const challenge = JSON.parse(row.payload) as DailyChallenge;
      this.assertSupportedRules(challenge.rules);
      if (row.status !== 'pending') {
        if (settlement && row.settlement !== canonical(settlement))
          throw new Error('Published settlement cannot be revised.');
        return row.status;
      }
      const now = this.now();
      if (now < Date.parse(challenge.settleAt))
        throw new Error('The full settlement window is not complete.');
      const expired = now >= Date.parse(challenge.voidAt);
      let complete = false;
      if (settlement && !expired) {
        if (
          !settlement.version.trim() ||
          settlement.prices.length !== 3 ||
          settlement.prices.some((price, index) => price.assetId !== challenge.assetIds[index])
        )
          throw new Error('Settlement needs a version and prices in the published asset order.');
        for (const price of settlement.prices)
          for (const value of [price.entry, price.exit]) {
            if (
              value !== null &&
              (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
            )
              throw new Error(
                'Settlement prices must be finite and positive, or null when missing.',
              );
          }
        complete = settlement.prices.every((price) => price.entry !== null && price.exit !== null);
      }
      if (!expired && !complete) return 'pending';
      const status = expired ? 'void' : 'settled';
      const entries = this.db
        .prepare('SELECT session_id,weights,result FROM daily_entries WHERE challenge_id=?')
        .all(challengeId) as unknown as EntryRow[];
      for (const entry of entries) {
        const weights = JSON.parse(entry.weights) as Weights;
        const result: DailyResult = expired
          ? {
              status: 'void',
              challengeId,
              weights,
              reason: 'Complete settlement prices were unavailable before the fixed timeout.',
            }
          : {
              status: 'settled',
              challengeId,
              weights,
              settlementVersion: settlement!.version,
              costVersion: challenge.rules.version,
              startCash: challenge.rules.startCash,
              cashPct: 0,
              prices: settlement!.prices,
              ...scoreAllocation(
                weights,
                settlement!.prices as { entry: number; exit: number }[],
                challenge.rules.startCash,
              ),
            };
        if (
          result.status === 'settled' &&
          ![result.endEquity, result.returnPct, result.benchmarkPct].every(Number.isFinite)
        )
          throw new Error('Settlement produces non-finite equity.');
        this.db
          .prepare('UPDATE daily_entries SET result=? WHERE challenge_id=? AND session_id=?')
          .run(canonical(result), challengeId, entry.session_id);
      }
      this.db
        .prepare('UPDATE daily_challenges SET status=?,settlement=? WHERE id=?')
        .run(status, expired ? null : canonical(settlement), challengeId);
      return status;
    });
  }
}
