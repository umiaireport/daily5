import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  acknowledgeDailyFiveRound,
  allCompletedDailyFiveResults,
  completedDailyFiveResults,
  completedDailyFiveResultsForPlayer,
  initializeDailyFiveDatabase,
  insertDailyFiveAttempt,
  insertDailyFiveClue,
  insertDailyFiveCommand,
  insertDailyFiveStartCommand,
  insertDailyFiveTicket,
  publishDailyFiveDay,
  readDailyFiveAttempt,
  readDailyFiveClues,
  readDailyFiveCommand,
  readDailyFiveDay,
  readDailyFiveStartCommand,
  readDailyFiveTickets,
  readOfficialDailyFiveAttempt,
  updateDailyFiveAttempt,
  type DailyFiveAttemptRow,
} from '../../db/daily-five.js';
import { transaction } from '../../db/store.js';
import {
  DAILY_FIVE_RULES,
  moneyFromCents,
  parseMoney,
  parsePrice,
  roundQuotient,
  type DailyFiveV2Rules,
  type DailyFiveRules,
} from '../../../shared/game-rules.js';
import type {
  DailyAttemptView,
  DailyFivePublic,
  DailyPublicRules,
  DailyFinalResult,
  DailyRoundPublic,
  DailySavedResult,
  DailyTicketDecision,
  DailyTicketResult,
  StartDailyFiveCommand,
  SubmitDailyDecisionCommand,
  UnlockDailyClueCommand,
  ContinueDailyCommand,
} from '../../../shared/daily-five.js';
import type { PublicAssetEvidence } from '../../../shared/evidence.js';
import { isPreDecisionPoint } from '../../../shared/evidence.js';
import { advanceStage, finishAttempt, lockTicket, validateTicket } from './lifecycle.js';
import { createSyntheticDailyFiveCasePack } from './synthetic.js';
import { lockPortfolio, validatePortfolioDecision } from './portfolio.js';
import {
  privateAssetIdentity,
  type DailyFiveAssignment,
  type DailyFiveCasePack,
  type DailyFivePrivateCandidate,
  type DailyFivePrivateRound,
} from './types.js';

export type DailyFiveErrorCode =
  | 'UNAVAILABLE'
  | 'INVALID_COMMAND'
  | 'INVALID_PHASE'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'STALE_STATE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DUPLICATE_COMMAND';

/** Typed HTTP-safe domain error for the route registrar and direct callers. */
export class DailyFiveError extends Error {
  readonly statusCode: number;
  readonly code: DailyFiveErrorCode;
  readonly retryable: boolean;
  readonly stateVersion?: number;

  constructor(
    code: DailyFiveErrorCode,
    message: string,
    statusCode = code === 'UNAVAILABLE'
      ? 503
      : code === 'NOT_FOUND'
        ? 404
        : code === 'FORBIDDEN'
          ? 403
          : 409,
    stateVersion?: number,
  ) {
    super(message);
    this.name = 'DailyFiveError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = code === 'STALE_STATE';
    this.stateVersion = stateVersion;
  }
}

export interface DailyFiveEngineOptions {
  readonly clock?: () => Date;
  readonly casePackFor?: (dailyId: string, dayStart: number) => DailyFiveCasePack;
  readonly rules?: DailyPublicRules;
  /** Hydrates reveal-only identities for older stored provider case packs. */
  readonly privateAssetIdentityForKey?: (
    key: string,
  ) => { readonly name: string; readonly symbol: string } | undefined;
  /** Optional publication namespace for keeping provider and practice days isolated. */
  readonly dayIdPrefix?: string;
  /** Live mode must never reopen a previously published synthetic cohort. */
  readonly requiredCohort?: string;
  /** Reuse a saved provider publication when its historical day is older than the server clock. */
  readonly publishedDailyId?: string;
  readonly displayNameForPlayer?: (playerId: string) => string | undefined;
}

export interface DailyLeaderboardEntry {
  readonly rank: number;
  readonly attemptId: string;
  readonly name?: string;
  readonly dailyId?: string;
  readonly completedAt?: string;
  readonly equity: string;
  readonly returnPct: string;
  readonly cohort: string;
}

export interface DailyLeaderboard {
  readonly dailyId: string;
  readonly cohort: string;
  readonly locked: boolean;
  readonly entries: readonly DailyLeaderboardEntry[];
  /** Rank of the authenticated player when their official result is complete. */
  readonly viewerRank?: number;
}

export interface DailyHistoryEntry extends DailyLeaderboardEntry {
  readonly dailyId: string;
  readonly completedAt: string;
}

type StoredPrivateRounds = readonly DailyFivePrivateRound[];

/** Stable JSON makes idempotency compare command meaning rather than object-key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  throw new DailyFiveError('INVALID_COMMAND', 'Commands must contain finite JSON values.', 400);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160)
    throw new DailyFiveError('INVALID_COMMAND', `${label} is required.`, 400);
  return value;
}

function dayIdAt(timestamp: number, rules: DailyPublicRules, dayIdPrefix?: string): string {
  // Wallet-carrying v2 is a new publication contract. Keep old isolated v2
  // case packs and attempts immutable while giving the repaired daily a fresh
  // namespace on an existing development database.
  const prefix = dayIdPrefix ?? (rules.version === 'daily-five-v2' ? 'daily-v2-wallet-' : 'daily-');
  return `${prefix}${new Date(timestamp).toISOString().slice(0, 10)}`;
}

function dayStartAt(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseAssignments(value: string): DailyFiveAssignment[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Stored Daily Five assignments are malformed.');
  return parsed as DailyFiveAssignment[];
}

function parseTickets(value: string): DailyTicketResult {
  return JSON.parse(value) as DailyTicketResult;
}

function currentWallet(
  db: DatabaseSync,
  attemptId: string,
  rules: DailyPublicRules,
): import('../../../shared/game-rules.js').Money {
  if (rules.version !== 'daily-five-v2') return rules.roundStake;
  const tickets = readDailyFiveTickets(db, attemptId)
    .map((ticket) => parseTickets(ticket.result))
    .sort((left, right) => left.roundIndex - right.roundIndex);
  return tickets.at(-1)?.endingEquity ?? rules.startingCapital;
}

function deterministicRank(seed: string, value: string): number {
  let hash = 2_166_136_261;
  for (const character of `${seed}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function assignCandidates(
  challenge: DailyFivePublic,
  playerId: string,
  attemptId: string,
): DailyFiveAssignment[] {
  return challenge.rounds.map((round) => ({
    roundIndex: round.roundIndex,
    candidateIds: [...round.candidates]
      .sort((left, right) => {
        const difference =
          deterministicRank(`${playerId}:${attemptId}:${round.roundIndex}`, left.assetId) -
          deterministicRank(`${playerId}:${attemptId}:${round.roundIndex}`, right.assetId);
        return difference || left.assetId.localeCompare(right.assetId);
      })
      .map((candidate) => candidate.assetId),
  }));
}

function asAttemptView(value: string): DailyAttemptView {
  return JSON.parse(value) as DailyAttemptView;
}

function roundPublicWithClues(
  publicRound: DailyRoundPublic,
  privateRound: DailyFivePrivateRound,
  candidateIds: readonly string[],
  unlockedIds: readonly string[],
  rules: DailyPublicRules,
): DailyRoundPublic {
  const privateById = new Map(
    privateRound.candidates.map((candidate) => [candidate.assetId, candidate]),
  );
  const candidates: PublicAssetEvidence[] = [];
  for (const assetId of candidateIds) {
    const publicCandidate = publicRound.candidates.find(
      (candidate) => candidate.assetId === assetId,
    );
    const privateCandidate = privateById.get(assetId);
    if (!publicCandidate || !privateCandidate)
      throw new Error('Daily Five assignment references an unknown candidate.');
    const clues = new Map((privateCandidate.clues ?? []).map((clue) => [clue.clueId, clue]));
    candidates.push({
      ...publicCandidate,
      unlockedClues: unlockedIds
        .filter((clueId) => clueId.startsWith(`${assetId}-`) || clues.has(clueId))
        .map((clueId) => clues.get(clueId))
        .filter((clue): clue is NonNullable<typeof clue> => Boolean(clue)),
    });
  }
  return {
    ...publicRound,
    candidates,
    unlocksRemaining: Math.max(0, rules.clueUnlocksPerRound - unlockedIds.length),
  };
}

function revealResultIdentity(
  result: DailyTicketResult,
  privateRound: DailyFivePrivateRound | undefined,
): DailyTicketResult {
  if (!privateRound) return result;
  const identities = new Map(
    privateRound.candidates.map((candidate) => [
      candidate.assetId,
      privateAssetIdentity(candidate),
    ]),
  );
  const directIdentity =
    result.decision.kind === 'trade' ? identities.get(result.decision.assetId) : undefined;
  const contributions = result.contributions?.map((contribution) => {
    const identity = identities.get(contribution.assetId);
    return identity ? { ...identity, ...contribution } : contribution;
  });
  return {
    ...result,
    ...(directIdentity ? { ...directIdentity } : {}),
    ...(contributions ? { contributions } : {}),
  };
}

function finalResultForRow(
  row: DailyFiveAttemptRow,
  pack: DailyFiveCasePack,
): DailyFinalResult | null {
  if (!row.final_result) return null;
  const result = JSON.parse(row.final_result) as DailyFinalResult;
  return {
    ...result,
    tickets: result.tickets.map((ticket) =>
      revealResultIdentity(
        ticket,
        pack.privateRounds.find((round) => round.roundIndex === ticket.roundIndex),
      ),
    ),
  };
}

/** Server-owned Daily Five lifecycle, persistence, assignment, and result projection. */
export class DailyFiveEngine {
  private readonly clock: () => Date;
  private readonly casePackFor: (dailyId: string, dayStart: number) => DailyFiveCasePack;
  private readonly rules: DailyPublicRules;
  private readonly privateAssetIdentityForKey:
    ((key: string) => { readonly name: string; readonly symbol: string } | undefined) | undefined;
  private readonly dayIdPrefix: string | undefined;
  private readonly requiredCohort: string | undefined;
  private readonly publishedDailyId: string | undefined;
  private readonly displayNameForPlayer: ((playerId: string) => string | undefined) | undefined;

  constructor(
    private readonly db: DatabaseSync,
    options: DailyFiveEngineOptions | (() => Date) = {},
  ) {
    const configured = typeof options === 'function' ? { clock: options } : options;
    this.clock = configured.clock ?? (() => new Date());
    this.rules = configured.rules ?? DAILY_FIVE_RULES;
    this.privateAssetIdentityForKey = configured.privateAssetIdentityForKey;
    this.dayIdPrefix = configured.dayIdPrefix;
    this.requiredCohort = configured.requiredCohort;
    this.publishedDailyId = configured.publishedDailyId;
    this.displayNameForPlayer = configured.displayNameForPlayer;
    this.casePackFor =
      configured.casePackFor ??
      ((dailyId, dayStart) => createSyntheticDailyFiveCasePack(dailyId, dayStart, this.rules));
    initializeDailyFiveDatabase(db);
  }

  private now(): Date {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      throw new DailyFiveError('INVALID_COMMAND', 'A valid server clock is required.', 500);
    return value;
  }

  private day(dailyId: string): DailyFiveCasePack {
    const row = readDailyFiveDay(this.db, dailyId);
    if (!row) throw new DailyFiveError('NOT_FOUND', 'Daily Five challenge not found.', 404);
    const storedPrivateRounds = JSON.parse(row.private_payload) as StoredPrivateRounds;
    const privateRounds = this.privateAssetIdentityForKey
      ? storedPrivateRounds.map((round) => ({
          ...round,
          candidates: round.candidates.map((candidate) => {
            if (!candidate.realAssetKey) return candidate;
            const identity = this.privateAssetIdentityForKey!(candidate.realAssetKey);
            return identity
              ? {
                  ...candidate,
                  realAssetName: candidate.realAssetName ?? identity.name,
                  realAssetSymbol: candidate.realAssetSymbol ?? identity.symbol,
                }
              : candidate;
          }),
        }))
      : storedPrivateRounds;
    return {
      publicChallenge: JSON.parse(row.public_payload) as DailyFivePublic,
      privateRounds,
      cohort: row.cohort,
    };
  }

  private ensureDay(dailyId: string): DailyFiveCasePack {
    const existing = readDailyFiveDay(this.db, dailyId);
    if (existing) {
      if (this.requiredCohort && existing.cohort !== this.requiredCohort)
        throw new DailyFiveError(
          'UNAVAILABLE',
          'Today has an older synthetic Daily Five publication. Provider-backed data is required in live mode.',
        );
      return this.day(dailyId);
    }
    const dayStart = dayStartAt(this.now().getTime());
    const pack = this.casePackFor(dailyId, dayStart);
    validateCasePack(pack, this.rules);
    if (pack.publicChallenge.dailyId !== dailyId)
      throw new Error('Daily Five case-pack id does not match its publication day.');
    publishDailyFiveDay(this.db, {
      daily_id: dailyId,
      public_payload: canonicalJson(pack.publicChallenge),
      private_payload: canonicalJson(pack.privateRounds),
      cohort: pack.cohort,
      published_at: pack.publicChallenge.publishedAt,
    });
    return pack;
  }

  /** Returns the immutable public challenge for the current UTC day. */
  today(): DailyFivePublic {
    const now = this.now().getTime();
    const dailyId = this.publishedDailyId ?? dayIdAt(now, this.rules, this.dayIdPrefix);
    return this.ensureDay(dailyId).publicChallenge;
  }

  /** Opens a new immutable one-round practice board. Practice IDs are never reused. */
  practice(): DailyFivePublic {
    const dailyId = `practice-${randomUUID()}`;
    const pack = this.casePackFor(dailyId, dayStartAt(this.now().getTime()));
    validateCasePack(pack, this.rules);
    publishDailyFiveDay(this.db, {
      daily_id: dailyId,
      public_payload: canonicalJson(pack.publicChallenge),
      private_payload: canonicalJson(pack.privateRounds),
      cohort: pack.cohort,
      published_at: pack.publicChallenge.publishedAt,
    });
    return pack.publicChallenge;
  }

  /** Resumes an attempt only for the player identity that created it. */
  resume(playerId: string, attemptId: string): DailyAttemptView {
    requireText(playerId, 'Player identity');
    requireText(attemptId, 'Attempt id');
    const row = this.authorizedAttempt(playerId, attemptId);
    return this.view(row);
  }

  /** Starts the first official attempt for a player/day and labels later starts as practice. */
  start(dailyId: string, playerId: string, command: StartDailyFiveCommand): DailyAttemptView {
    requireText(dailyId, 'Daily id');
    requireText(playerId, 'Player identity');
    const idempotencyKey = requireText(command?.idempotencyKey, 'Idempotency key');
    const requestedMode = command?.mode ?? 'official';
    const payload = canonicalJson({ idempotencyKey, mode: requestedMode });
    const activeDailyId =
      this.publishedDailyId ?? dayIdAt(this.now().getTime(), this.rules, this.dayIdPrefix);
    if (requestedMode === 'official' && dailyId !== activeDailyId)
      throw new DailyFiveError(
        'UNAVAILABLE',
        'This Daily Five is frozen. New official attempts open on today’s board.',
        409,
      );
    this.ensureDay(dailyId);
    return transaction(this.db, () => {
      const prior = readDailyFiveStartCommand(this.db, dailyId, playerId, idempotencyKey);
      if (prior) {
        if (prior.payload !== payload)
          throw new DailyFiveError(
            'IDEMPOTENCY_CONFLICT',
            'The start key was used with another command.',
          );
        return asAttemptView(prior.response);
      }
      const challenge = this.day(dailyId);
      const official = readOfficialDailyFiveAttempt(this.db, dailyId, playerId);
      const attemptId = randomUUID();
      const now = this.now().toISOString();
      const row: DailyFiveAttemptRow = {
        attempt_id: attemptId,
        daily_id: dailyId,
        player_id: playerId,
        mode: requestedMode === 'practice' ? 'practice' : official ? 'practice' : 'official',
        phase: 'round-open',
        state_version: 1,
        current_round_index: 1,
        assignments: canonicalJson(
          assignCandidates(challenge.publicChallenge, playerId, attemptId),
        ),
        final_result: null,
        created_at: now,
        completed_at: null,
      };
      insertDailyFiveAttempt(this.db, row);
      const response = this.view(row);
      insertDailyFiveStartCommand(this.db, {
        daily_id: dailyId,
        player_id: playerId,
        idempotency_key: idempotencyKey,
        payload,
        attempt_id: attemptId,
        response: canonicalJson(response),
        created_at: now,
      });
      return response;
    });
  }

  /** Named operation for starting a persisted attempt. */
  startAttempt(
    dailyId: string,
    playerId: string,
    command: StartDailyFiveCommand,
  ): DailyAttemptView {
    return this.start(dailyId, playerId, command);
  }

  /** Unlocks one distinct clue and returns the current round projection. */
  unlock(playerId: string, attemptId: string, command: UnlockDailyClueCommand): DailyAttemptView {
    return this.mutate(playerId, attemptId, command, 'unlock-clue', (row, pack) => {
      if (row.phase !== 'round-open')
        throw new DailyFiveError(
          'INVALID_PHASE',
          'Clues can be unlocked only before the ticket is locked.',
          409,
          row.state_version,
        );
      if (command.roundIndex !== row.current_round_index)
        throw new DailyFiveError(
          'INVALID_COMMAND',
          'The clue belongs to another round.',
          400,
          row.state_version,
        );
      const round = this.currentRound(pack.publicChallenge, row.current_round_index);
      const rules = pack.publicChallenge.rules;
      const candidate = round.candidates.find((item) => item.assetId === command.assetId);
      if (!candidate || !candidate.clueDescriptors.some((clue) => clue.clueId === command.clueId))
        throw new DailyFiveError(
          'INVALID_COMMAND',
          'Choose a clue on an asset in the current round.',
          400,
          row.state_version,
        );
      const unlocked = readDailyFiveClues(this.db, attemptId, row.current_round_index);
      if (!unlocked.includes(command.clueId)) {
        if (unlocked.length >= rules.clueUnlocksPerRound)
          throw new DailyFiveError(
            'INVALID_COMMAND',
            'All three clue unlocks are already spent for this round.',
            409,
            row.state_version,
          );
        const inserted = insertDailyFiveClue(
          this.db,
          attemptId,
          row.current_round_index,
          command.clueId,
          this.now().toISOString(),
        );
        if (inserted) row.state_version += 1;
      }
      return row;
    });
  }

  /** Named operation for unlocking a clue within the current round. */
  unlockClue(
    playerId: string,
    attemptId: string,
    command: UnlockDailyClueCommand,
  ): DailyAttemptView {
    return this.unlock(playerId, attemptId, command);
  }

  /** Validates, settles, and saves one immutable ticket with its immediate result. */
  submit(
    playerId: string,
    attemptId: string,
    command: SubmitDailyDecisionCommand,
  ): DailyAttemptView {
    return this.mutate(playerId, attemptId, command, command.kind, (row, pack) => {
      if (row.phase !== 'round-open')
        throw new DailyFiveError(
          'INVALID_PHASE',
          'A ticket can be submitted only from an open round.',
          409,
          row.state_version,
        );
      if (command.roundIndex !== row.current_round_index)
        throw new DailyFiveError(
          'INVALID_COMMAND',
          'The ticket belongs to another round.',
          400,
          row.state_version,
        );
      const publicRound = this.currentRound(pack.publicChallenge, row.current_round_index);
      const rules = pack.publicChallenge.rules;
      let decision: DailyTicketDecision;
      try {
        const normalizedCommand =
          rules.version === 'daily-five-v2' && command.kind === 'cash'
            ? {
                kind: 'portfolio' as const,
                roundIndex: command.roundIndex,
                allocations: [],
                cashWeightBps: 10_000,
              }
            : command;
        decision =
          rules.version === 'daily-five-v2'
            ? validatePortfolioDecision(normalizedCommand, publicRound, rules)
            : validateTicket(normalizedCommand, publicRound, rules);
      } catch (error) {
        if (error instanceof DailyFiveError) throw error;
        throw new DailyFiveError(
          'INVALID_COMMAND',
          error instanceof Error ? error.message : 'The ticket was rejected.',
          400,
          row.state_version,
        );
      }
      const assignment = this.assignment(row, row.current_round_index);
      const privateRound = this.privateRound(pack, row.current_round_index);
      const assignedCandidates = privateRound.candidates.filter((item) =>
        assignment.candidateIds.includes(item.assetId),
      );
      const candidate =
        decision.kind === 'trade'
          ? assignedCandidates.find((item) => item.assetId === decision.assetId)
          : undefined;
      let result: DailyTicketResult;
      try {
        if (rules.version === 'daily-five-v2') {
          if (decision.kind !== 'portfolio')
            throw new Error('A v2 day needs a portfolio decision.');
          result = lockPortfolio(
            row.current_round_index,
            decision,
            assignedCandidates,
            rules,
            currentWallet(this.db, attemptId, rules),
          );
        } else {
          result = lockTicket({
            roundIndex: row.current_round_index,
            decision,
            candidate,
            rules,
          });
        }
      } catch (error) {
        if (error instanceof DailyFiveError) throw error;
        throw new DailyFiveError(
          'INVALID_COMMAND',
          error instanceof Error ? error.message : 'The ticket could not be settled.',
          400,
          row.state_version,
        );
      }
      insertDailyFiveTicket(this.db, {
        attempt_id: attemptId,
        round_index: row.current_round_index,
        command: canonicalJson(command),
        result: canonicalJson(result),
        locked_at: this.now().toISOString(),
      });
      row.phase = 'saved-result';
      row.state_version += 1;
      return row;
    });
  }

  /** Acknowledges the saved ticket and moves to the next round or immutable final result. */
  continue(playerId: string, attemptId: string, command: ContinueDailyCommand): DailyAttemptView {
    return this.mutate(playerId, attemptId, command, 'continue', (row, pack) => {
      if (row.phase !== 'saved-result')
        throw new DailyFiveError(
          'INVALID_PHASE',
          'Continue is available after a saved result.',
          409,
          row.state_version,
        );
      if (command.roundIndex !== row.current_round_index)
        throw new DailyFiveError(
          'INVALID_COMMAND',
          'The continue action belongs to another round.',
          400,
          row.state_version,
        );
      acknowledgeDailyFiveRound(
        this.db,
        attemptId,
        row.current_round_index,
        this.now().toISOString(),
      );
      const savedTicket = readDailyFiveTickets(this.db, attemptId).find(
        (ticket) => ticket.round_index === row.current_round_index,
      );
      if (!savedTicket) throw new Error('The saved Daily Five result is missing.');
      const savedResult = parseTickets(savedTicket.result);
      const endedEarly =
        pack.publicChallenge.rules.version === 'daily-five-v2' &&
        parseMoney(savedResult.endingEquity) === 0n;
      const stage = endedEarly
        ? { phase: 'final-result' as const, currentRoundIndex: null }
        : advanceStage(row.phase, row.current_round_index, pack.publicChallenge.rules.totalRounds);
      row.state_version += 1;
      row.phase = stage.phase;
      row.current_round_index = stage.currentRoundIndex;
      if (stage.phase === 'final-result') {
        const tickets = readDailyFiveTickets(this.db, attemptId).map((ticket) =>
          parseTickets(ticket.result),
        );
        const finalResult = finishAttempt(
          tickets,
          pack.cohort,
          row.state_version,
          pack.publicChallenge.rules,
          endedEarly,
        );
        row.final_result = canonicalJson(finalResult);
        row.completed_at = this.now().toISOString();
      }
      return row;
    });
  }

  /** Builds a completed-attempt leaderboard from raw saved equity in the case-pack cohort. */
  leaderboard(dailyId: string, viewerId?: string): DailyLeaderboard {
    const challenge = this.ensureDay(dailyId);
    const ranked = completedDailyFiveResults(this.db, dailyId)
      .filter((entry) => entry.mode === 'official')
      .map((entry) => {
        const result = JSON.parse(entry.final_result) as DailyFinalResult;
        return {
          playerId: entry.player_id,
          attemptId: entry.attempt_id,
          name: this.displayNameForPlayer?.(entry.player_id),
          dailyId: entry.daily_id,
          completedAt: entry.completed_at,
          equity: result.totalEquity,
          returnPct: result.returnPct,
          cohort: result.cohort,
        };
      })
      .sort((left, right) => {
        const equityDifference = parseMoney(right.equity) - parseMoney(left.equity);
        return Number(equityDifference) || left.attemptId.localeCompare(right.attemptId);
      });
    const viewerRank = viewerId ? ranked.findIndex((entry) => entry.playerId === viewerId) + 1 : 0;
    const entries = ranked.map(({ playerId: _playerId, ...entry }, index) => ({
      rank: index + 1,
      ...entry,
    }));
    return {
      dailyId,
      cohort: challenge.cohort,
      locked: dailyId !== dayIdAt(this.now().getTime(), this.rules, this.dayIdPrefix),
      entries,
      ...(viewerRank > 0 ? { viewerRank } : {}),
    };
  }

  history(playerId: string): { entries: readonly DailyHistoryEntry[] } {
    requireText(playerId, 'Player identity');
    const entries = completedDailyFiveResultsForPlayer(this.db, playerId).map((entry, index) => {
      const result = JSON.parse(entry.final_result) as DailyFinalResult;
      return {
        rank: index + 1,
        attemptId: entry.attempt_id,
        dailyId: entry.daily_id,
        completedAt: entry.completed_at,
        name: this.displayNameForPlayer?.(entry.player_id),
        equity: result.totalEquity,
        returnPct: result.returnPct,
        cohort: result.cohort,
      };
    });
    return { entries };
  }

  allTimeLeaderboard(limit = 100): { entries: readonly DailyHistoryEntry[] } {
    const entries = allCompletedDailyFiveResults(this.db)
      .map((entry) => {
        const result = JSON.parse(entry.final_result) as DailyFinalResult;
        return {
          attemptId: entry.attempt_id,
          dailyId: entry.daily_id,
          completedAt: entry.completed_at,
          name: this.displayNameForPlayer?.(entry.player_id),
          equity: result.totalEquity,
          returnPct: result.returnPct,
          cohort: result.cohort,
        };
      })
      .sort((left, right) => {
        const difference = parseMoney(right.equity) - parseMoney(left.equity);
        return Number(difference) || right.completedAt.localeCompare(left.completedAt);
      })
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map((entry, index) => ({ rank: index + 1, ...entry }));
    return { entries };
  }

  /** Exposes the named operation for coordinators that wrap persistence themselves. */
  lockTicket(input: Parameters<typeof lockTicket>[0]): DailyTicketResult {
    return lockTicket(input);
  }

  /** Exposes the named operation for coordinators that wrap persistence themselves. */
  advanceStage(
    phase: 'round-open' | 'saved-result' | 'final-result',
    currentRoundIndex: number | null,
  ) {
    return advanceStage(phase, currentRoundIndex, this.rules.totalRounds);
  }

  /** Exposes the named operation for coordinators that aggregate saved tickets. */
  finishAttempt(tickets: readonly DailyTicketResult[], cohort: string, stateVersion: number) {
    return finishAttempt(tickets, cohort, stateVersion);
  }

  private authorizedAttempt(playerId: string, attemptId: string): DailyFiveAttemptRow {
    const row = readDailyFiveAttempt(this.db, attemptId);
    if (!row) throw new DailyFiveError('NOT_FOUND', 'Daily Five attempt not found.', 404);
    if (row.player_id !== playerId)
      throw new DailyFiveError('FORBIDDEN', 'This attempt belongs to another player.', 403);
    return row;
  }

  private currentRound(challenge: DailyFivePublic, roundIndex: number | null): DailyRoundPublic {
    if (roundIndex === null) throw new Error('A current round is required.');
    const round = challenge.rounds.find((item) => item.roundIndex === roundIndex);
    if (!round) throw new Error('Daily Five round not found.');
    return round;
  }

  private privateRound(pack: DailyFiveCasePack, roundIndex: number | null): DailyFivePrivateRound {
    if (roundIndex === null) throw new Error('A current round is required.');
    const round = pack.privateRounds.find((item) => item.roundIndex === roundIndex);
    if (!round) throw new Error('Private Daily Five round not found.');
    return round;
  }

  private assignment(row: DailyFiveAttemptRow, roundIndex: number | null): DailyFiveAssignment {
    if (roundIndex === null) throw new Error('A current round is required.');
    const assignment = parseAssignments(row.assignments).find(
      (item) => item.roundIndex === roundIndex,
    );
    if (!assignment) throw new Error('Daily Five assignment not found.');
    return assignment;
  }

  private view(row: DailyFiveAttemptRow): DailyAttemptView {
    const pack = this.day(row.daily_id);
    const finalResult = finalResultForRow(row, pack);
    if (row.phase === 'final-result') {
      if (!finalResult) throw new Error('Final Daily Five result is missing.');
      return {
        mode: row.mode,
        attemptId: row.attempt_id,
        dailyId: row.daily_id,
        rules: pack.publicChallenge.rules,
        phase: 'final-result',
        stateVersion: row.state_version,
        currentRoundIndex: null,
        round: null,
        savedResult: null,
        finalResult,
      };
    }
    const roundIndex = row.current_round_index;
    const assignment = this.assignment(row, roundIndex);
    const publicRound = this.currentRound(pack.publicChallenge, roundIndex);
    const privateRound = this.privateRound(pack, roundIndex);
    const round = roundPublicWithClues(
      publicRound,
      privateRound,
      assignment.candidateIds,
      readDailyFiveClues(this.db, row.attempt_id, roundIndex!),
      pack.publicChallenge.rules,
    );
    const ticket = readDailyFiveTickets(this.db, row.attempt_id).find(
      (item) => item.round_index === roundIndex,
    );
    const savedResult: DailySavedResult | null =
      row.phase === 'saved-result' && ticket
        ? {
            phase: 'saved-result',
            stateVersion: row.state_version,
            result: revealResultIdentity(parseTickets(ticket.result), privateRound),
            next: 'continue',
          }
        : null;
    const wallet = currentWallet(this.db, row.attempt_id, pack.publicChallenge.rules);
    return {
      mode: row.mode,
      attemptId: row.attempt_id,
      dailyId: row.daily_id,
      rules: pack.publicChallenge.rules,
      phase: row.phase,
      stateVersion: row.state_version,
      currentRoundIndex: roundIndex,
      currentWallet: wallet,
      round,
      savedResult,
      finalResult: null,
    };
  }

  private mutate<Command extends { expectedStateVersion: number; idempotencyKey: string }, Result>(
    playerId: string,
    attemptId: string,
    command: Command,
    kind: string,
    transition: (row: DailyFiveAttemptRow, pack: DailyFiveCasePack) => DailyFiveAttemptRow,
  ): DailyAttemptView {
    requireText(playerId, 'Player identity');
    requireText(attemptId, 'Attempt id');
    if (!Number.isInteger(command?.expectedStateVersion) || command.expectedStateVersion < 1)
      throw new DailyFiveError(
        'INVALID_COMMAND',
        'A valid expected state version is required.',
        400,
      );
    const idempotencyKey = requireText(command?.idempotencyKey, 'Idempotency key');
    const payload = canonicalJson(command);
    return transaction(this.db, () => {
      let row = this.authorizedAttempt(playerId, attemptId);
      const prior = readDailyFiveCommand(this.db, attemptId, idempotencyKey);
      if (prior) {
        if (prior.payload !== payload)
          throw new DailyFiveError(
            'IDEMPOTENCY_CONFLICT',
            'The idempotency key was used with another command.',
          );
        return asAttemptView(prior.response);
      }
      if (command.expectedStateVersion !== row.state_version)
        throw new DailyFiveError(
          'STALE_STATE',
          'The command was based on an older state version.',
          409,
          row.state_version,
        );
      const pack = this.day(row.daily_id);
      const next = transition(row, pack);
      updateDailyFiveAttempt(this.db, next);
      row = next;
      const response = this.view(row);
      insertDailyFiveCommand(this.db, {
        attempt_id: attemptId,
        idempotency_key: idempotencyKey,
        kind,
        payload,
        response: canonicalJson(response),
        created_at: this.now().toISOString(),
      });
      return response;
    });
  }
}

/** Validates the immutable boundary before a pack can be published. */
export function validateCasePack(
  pack: DailyFiveCasePack,
  rules: DailyPublicRules = DAILY_FIVE_RULES,
): void {
  if (
    !pack.cohort.trim() ||
    pack.publicChallenge.rules.version !== rules.version ||
    pack.publicChallenge.rounds.length !== rules.totalRounds ||
    pack.privateRounds.length !== rules.totalRounds
  )
    throw new Error('A Daily Five case pack needs five rounds and a cohort.');
  const seenWindows = new Map<string, { start: number; end: number }[]>();
  for (let index = 0; index < pack.publicChallenge.rounds.length; index += 1) {
    const publicRound = pack.publicChallenge.rounds[index]!;
    const privateRound = pack.privateRounds.find(
      (item) => item.roundIndex === publicRound.roundIndex,
    );
    if (
      !privateRound ||
      publicRound.roundIndex !== index + 1 ||
      publicRound.candidates.length !== rules.candidatesPerRound ||
      publicRound.candidates.some(
        (candidate) =>
          candidate.clueDescriptors.length !== 6 ||
          candidate.chart.some((point) => !isPreDecisionPoint(point, publicRound.cutoffAt)),
      )
    )
      throw new Error('Each Daily Five round needs five matching private candidates.');
    if (
      new Set(publicRound.candidates.map((candidate) => candidate.assetId)).size !==
      rules.candidatesPerRound
    )
      throw new Error('Daily Five candidate ids must be distinct within a round.');
    if (
      new Set(privateRound.candidates.map((candidate) => candidate.assetId)).size !==
      rules.candidatesPerRound
    )
      throw new Error('Daily Five private candidate ids must be distinct within a round.');
    for (const candidate of privateRound.candidates) {
      const publicCandidate = publicRound.candidates.find(
        (item) => item.assetId === candidate.assetId,
      );
      const privateClues = candidate.clues ?? [];
      if (
        !publicCandidate ||
        !candidate.variantId.trim() ||
        candidate.candles.length === 0 ||
        privateClues.length !== publicCandidate.clueDescriptors.length ||
        new Set(privateClues.map((clue) => clue.clueId)).size !== privateClues.length ||
        publicCandidate.clueDescriptors.some(
          (descriptor) => !privateClues.some((clue) => clue.clueId === descriptor.clueId),
        )
      )
        throw new Error('Each Daily Five candidate needs public evidence, a variant, and candles.');
      if (candidate.entryPrice && candidate.entryPrice !== candidate.candles[0]!.open)
        throw new Error('A private entry price must equal the first outcome candle open.');
      if (candidate.entryPrice) parsePrice(candidate.entryPrice);
      if (
        candidate.candles.some((candle) => Date.parse(candle.at) < Date.parse(publicRound.cutoffAt))
      )
        throw new Error('Outcome candles must begin after the evidence cutoff.');
      for (const candle of candidate.candles) {
        const at = Date.parse(candle.at);
        if (
          !Number.isFinite(at) ||
          parsePrice(candle.open) <= 0 ||
          parsePrice(candle.high) <= 0 ||
          parsePrice(candle.low) <= 0 ||
          parsePrice(candle.close) <= 0
        )
          throw new Error('Daily Five outcome candles need finite positive prices and timestamps.');
      }
      if (candidate.realAssetKey && candidate.windowStart && candidate.windowEnd) {
        const start = Date.parse(candidate.windowStart);
        const end = Date.parse(candidate.windowEnd);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
          throw new Error('Daily Five outcome windows must be ordered.');
        const prior = seenWindows.get(candidate.realAssetKey) ?? [];
        if (prior.some((window) => start <= window.end && end >= window.start))
          throw new Error('A real asset cannot reuse an overlapping future outcome window.');
        prior.push({ start, end });
        seenWindows.set(candidate.realAssetKey, prior);
      }
    }
  }
}

export { createSyntheticDailyFiveCasePack } from './synthetic.js';
export { advanceStage, finishAttempt, lockTicket, validateTicket } from './lifecycle.js';
export {
  evaluateCash,
  evaluatePosition,
  equityAtPrice,
  findLiquidation,
  reservedCostCents,
} from './settlement.js';

/** Functional facade for callers that keep an engine instance outside a route module. */
export function startAttempt(
  engine: DailyFiveEngine,
  dailyId: string,
  playerId: string,
  command: StartDailyFiveCommand,
): DailyAttemptView {
  return engine.startAttempt(dailyId, playerId, command);
}

/** Functional facade for the persisted clue-unlock operation. */
export function unlockClue(
  engine: DailyFiveEngine,
  playerId: string,
  attemptId: string,
  command: UnlockDailyClueCommand,
): DailyAttemptView {
  return engine.unlockClue(playerId, attemptId, command);
}
