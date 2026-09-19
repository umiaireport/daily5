import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { DailyFinalResult, DailyTicketResult } from '../../../shared/daily-five.js';
import type { HuntReveal } from '../../../shared/hunt.js';
import {
  canShowPercentile,
  type DailyHistoryEntry,
  type HuntHistoryEntry,
  type ProgressionBadge,
  type ProgressionView,
  type ResultComparison,
  type ShareResult,
} from '../../../shared/progression.js';
import { parseMoney, type Money } from '../../../shared/game-rules.js';
import {
  initializeProgressionDatabase,
  insertProgressionBadge,
  insertProgressionDailyResult,
  insertProgressionHuntResult,
  insertProgressionShare,
  progressionTransaction,
  readProgressionBadges,
  readProgressionDailyComparison,
  readProgressionDailyForDay,
  readProgressionDailyResult,
  readProgressionDailyResults,
  readProgressionHuntResult,
  readProgressionHuntResults,
  readProgressionShare,
  type ProgressionDailyRow,
  type ProgressionHuntRow,
} from '../../db/progression.js';
import {
  BADGE_DEFINITIONS,
  PROGRESSION_BADGES,
  badgeDefinition,
  dailyBadgeIds,
  huntBadgeIds,
  type ProgressionBadgeId,
} from './badges.js';
import type {
  DailyComparisonRequest,
  DailyProgressionInput,
  HuntProgressionInput,
  ProgressionLink,
  ProgressionMatchKind,
  ProgressionHuntRole,
  ProgressionServiceOptions,
  ProgressionShareInput,
  PublicShareRecord,
} from './types.js';

export type ProgressionErrorCode = 'INVALID_RESULT' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT';

/** Typed progression error for route serializers and coordinator integrations. */
export class ProgressionError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ProgressionErrorCode,
    message: string,
    statusCode = code === 'NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 409,
  ) {
    super(message);
    this.name = 'ProgressionError';
    this.statusCode = statusCode;
  }
}

interface NormalizedDaily {
  readonly row: ProgressionDailyRow;
  readonly result: DailyFinalResult | null;
}

interface NormalizedHunt {
  readonly row: ProgressionHuntRow;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value)
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  throw new ProgressionError(
    'INVALID_RESULT',
    'Finalized results must contain finite JSON values.',
    400,
  );
}

function requireText(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ProgressionError('INVALID_RESULT', `${label} is required.`, 400);
  return value;
}

function validInstant(value: string, label: string): string {
  const at = Date.parse(value);
  if (!Number.isFinite(at))
    throw new ProgressionError('INVALID_RESULT', `${label} must be a valid timestamp.`, 400);
  return new Date(at).toISOString();
}

function validMoney(value: unknown, label: string): Money {
  if (typeof value !== 'string')
    throw new ProgressionError('INVALID_RESULT', `${label} must be fixed-point money.`, 400);
  try {
    parseMoney(value);
  } catch {
    throw new ProgressionError('INVALID_RESULT', `${label} must be fixed-point money.`, 400);
  }
  return value as Money;
}

function validCount(value: unknown, label: string, maximum?: number): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (maximum !== undefined && (value as number) > maximum)
  )
    throw new ProgressionError('INVALID_RESULT', `${label} is outside its finalized range.`, 400);
  return value as number;
}

function isWinningDirection(ticket: DailyTicketResult): boolean {
  return (
    ticket.decision.kind === 'trade' && !ticket.liquidated && !ticket.returnPct.startsWith('-')
  );
}

function derivedDailyAccuracy(result: DailyFinalResult): {
  readonly correctDirections: number;
  readonly directionalTrades: number;
} {
  const directional = result.tickets.filter((ticket) => ticket.decision.kind === 'trade');
  return {
    correctDirections: directional.filter(isWinningDirection).length,
    directionalTrades: directional.length,
  };
}

function dateKey(value: string): string {
  return validInstant(value, 'Completion time').slice(0, 10);
}

function ordinal(day: string): number {
  const value = Date.parse(`${day}T00:00:00.000Z`);
  return Math.floor(value / 86_400_000);
}

/** Calculates current and best streaks using UTC calendar days only. */
export function calculateUtcStreak(
  completedAt: readonly string[],
  now = new Date(),
): { readonly currentStreak: number; readonly bestStreak: number } {
  const unique = [...new Set(completedAt.map(dateKey))].sort();
  if (!unique.length) return { currentStreak: 0, bestStreak: 0 };
  let bestStreak = 1;
  let run = 1;
  for (let index = 1; index < unique.length; index += 1) {
    if (ordinal(unique[index]!) === ordinal(unique[index - 1]!) + 1) run += 1;
    else run = 1;
    bestStreak = Math.max(bestStreak, run);
  }
  const today = ordinal(now.toISOString().slice(0, 10));
  const newest = ordinal(unique.at(-1)!);
  if (today - newest > 1) return { currentStreak: 0, bestStreak };
  let currentStreak = 1;
  for (let index = unique.length - 1; index > 0; index -= 1) {
    if (ordinal(unique[index]!) === ordinal(unique[index - 1]!) + 1) currentStreak += 1;
    else break;
  }
  return { currentStreak, bestStreak };
}

function dailyHistory(row: ProgressionDailyRow): DailyHistoryEntry {
  return {
    attemptId: row.attempt_id,
    completedAt: row.completed_at,
    equity: row.equity as Money,
    returnPct: row.return_pct,
    rulesVersion: row.rules_version,
    variantId: row.variant_id,
  };
}

function huntHistory(row: ProgressionHuntRow): HuntHistoryEntry {
  return {
    matchId: row.match_id,
    matchKind: row.match_kind,
    completedAt: row.completed_at,
    role: row.role,
    won: row.won === 1,
    rulesVersion: row.rules_version,
  };
}

function badgeView(row: {
  readonly badge_id: string;
  readonly earned_at: string;
}): ProgressionBadge {
  const definition = badgeDefinition(row.badge_id);
  if (!definition) throw new Error(`Unknown progression badge ${row.badge_id}.`);
  return { ...definition, earnedAt: row.earned_at };
}

function comparisonNote(
  scope: 'exact-variant' | 'cohort',
  scopeId: string,
  cohortId: string,
  eligibleAttempts: number,
): string {
  const state = canShowPercentile(eligibleAttempts)
    ? 'final percentile available'
    : 'provisional until 20 eligible attempts';
  const label = scope === 'exact-variant' ? 'exact case-pack variant' : 'case-pack cohort';
  return `Official results only · ${label} ${scopeId} · cohort ${cohortId} · ${eligibleAttempts} eligible attempts · ${state}.`;
}

function pairIncludesDecoy(
  reveal: HuntReveal | undefined,
  targetPair: { readonly primaryAssetId: string; readonly secondaryAssetId: string } | undefined,
): boolean {
  if (!reveal?.accusation || !targetPair) return false;
  return (
    (reveal.accusation.primaryAssetId !== targetPair.primaryAssetId &&
      reveal.accusation.primaryAssetId !== targetPair.secondaryAssetId) ||
    (reveal.accusation.secondaryAssetId !== targetPair.primaryAssetId &&
      reveal.accusation.secondaryAssetId !== targetPair.secondaryAssetId)
  );
}

function winningRole(role: ProgressionHuntRole): 'whale' | 'tracer' {
  return role === 'whale' ? 'whale' : 'tracer';
}

/** Server-owned persistence, streak, award, comparison, and opaque share boundary. */
export class ProgressionService {
  private readonly clock: () => Date;
  private readonly idFactory: () => string;

  constructor(
    private readonly db: DatabaseSync,
    options: ProgressionServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    initializeProgressionDatabase(db);
  }

  /** Returns the public profile projection; practice rows remain persisted but out of official history. */
  view(playerId: string): ProgressionView {
    const id = requireText(playerId, 'Player identity');
    const daily = readProgressionDailyResults(this.db, id, 'official');
    const hunts = readProgressionHuntResults(this.db, id);
    const streak = calculateUtcStreak(
      daily.map((row) => row.completed_at),
      this.now(),
    );
    return {
      ...streak,
      dailyHistory: daily.map(dailyHistory),
      huntHistory: hunts.map(huntHistory),
      badges: readProgressionBadges(this.db, id).map(badgeView),
    };
  }

  /** Alias used by route registrars and coordinators. */
  history(playerId: string): ProgressionView {
    return this.view(playerId);
  }

  /** Saves one finalized Daily Five result, awards once, and returns the refreshed profile. */
  recordDailyResult(input: DailyProgressionInput): ProgressionView {
    const normalized = this.normalizeDaily(input);
    progressionTransaction(this.db, () => {
      const existing = readProgressionDailyResult(this.db, normalized.row.attempt_id);
      if (existing) {
        if (existing.finalized_payload !== normalized.row.finalized_payload)
          throw new ProgressionError(
            'CONFLICT',
            'This Daily Five completion was already recorded with different data.',
          );
        return;
      }
      const sameDay = readProgressionDailyForDay(
        this.db,
        normalized.row.player_id,
        normalized.row.daily_id,
        normalized.row.mode,
      );
      if (sameDay && normalized.row.mode === 'official')
        throw new ProgressionError(
          'CONFLICT',
          'This Daily Five mode already has a saved completion for this day.',
        );
      insertProgressionDailyResult(this.db, normalized.row);
      if (normalized.row.mode === 'official')
        for (const badgeId of dailyBadgeIds({
          correctDirections: normalized.row.correct_directions,
          directionalTrades: normalized.row.directional_trades,
        }))
          this.award(normalized.row.player_id, badgeId);
    });
    return this.view(normalized.row.player_id);
  }

  /** Alias for integrations that name the finalized operation as a completion. */
  recordDailyCompletion(input: DailyProgressionInput): ProgressionView {
    return this.recordDailyResult(input);
  }

  /** Saves one finalized Hunt participant outcome and awards role-specific cosmetics once. */
  recordHuntResult(input: HuntProgressionInput): ProgressionView {
    const normalized = this.normalizeHunt(input);
    progressionTransaction(this.db, () => {
      const existing = readProgressionHuntResult(
        this.db,
        normalized.row.match_id,
        normalized.row.player_id,
      );
      if (existing) {
        if (existing.finalized_payload !== normalized.row.finalized_payload)
          throw new ProgressionError(
            'CONFLICT',
            'This Hunt completion was already recorded with different data.',
          );
        return;
      }
      insertProgressionHuntResult(this.db, normalized.row);
      for (const badgeId of huntBadgeIds({
        role: normalized.row.role,
        won: normalized.row.won === 1,
        finalPairCorrect: normalized.row.final_pair_correct === 1,
        finalIncludesDecoy: normalized.row.final_includes_decoy === 1,
      }))
        this.award(normalized.row.player_id, badgeId);
      const history = readProgressionHuntResults(this.db, normalized.row.player_id);
      const qualifying = new Set(
        history
          .filter(
            (row) =>
              row.correct_pair_before_final === 1 &&
              (row.role === 'tracer' || row.role === 'captain'),
          )
          .map((row) => row.match_id),
      );
      if (qualifying.size >= 3)
        this.award(normalized.row.player_id, PROGRESSION_BADGES.patternReader);
      const winningSides = new Set(
        history.filter((row) => row.won === 1).map((row) => winningRole(row.role)),
      );
      if (winningSides.has('whale') && winningSides.has('tracer'))
        this.award(normalized.row.player_id, PROGRESSION_BADGES.bothSides);
    });
    return this.view(normalized.row.player_id);
  }

  /** Alias for integrations that name the finalized operation as a completion. */
  recordHuntCompletion(input: HuntProgressionInput): ProgressionView {
    return this.recordHuntResult(input);
  }

  /** Compares one official result inside its exact variant by default, with no speed tie-breaker. */
  compareDaily(input: DailyComparisonRequest): ResultComparison {
    const playerId = requireText(input.playerId, 'Player identity');
    const dailyId = requireText(input.dailyId, 'Daily id');
    const own = readProgressionDailyForDay(this.db, playerId, dailyId, 'official');
    if (!own)
      throw new ProgressionError(
        'NOT_FOUND',
        'No completed official Daily Five result exists for this day.',
        404,
      );
    const scope = input.scope ?? 'exact-variant';
    if (scope === 'exact-variant') {
      const variantId = input.variantId ?? own.variant_id;
      if (variantId !== own.variant_id)
        throw new ProgressionError(
          'FORBIDDEN',
          'A comparison cannot detach your result from its exact variant.',
          403,
        );
      const entries = readProgressionDailyComparison(this.db, { dailyId, variantId });
      return this.comparison(own, entries, 'exact-variant', variantId);
    }
    const cohortId = input.cohortId ?? own.cohort_id;
    const entries = readProgressionDailyComparison(this.db, { dailyId, cohortId });
    return this.comparison(own, entries, 'cohort', cohortId);
  }

  /** Alias for route consumers that call the operation a leaderboard. */
  leaderboard(input: DailyComparisonRequest): ResultComparison {
    return this.compareDaily(input);
  }

  /** Creates a public result record containing permitted metadata only. */
  createShare(input: ProgressionShareInput): PublicShareRecord {
    const owner = requireText(input.ownerPlayerId, 'Share owner');
    const createdAt = this.now().toISOString();
    const shareId = requireText(this.idFactory(), 'Share id');
    const result: ShareResult = {
      shareId,
      activity: input.result.activity,
      createdAt,
      ...(input.result.activity === 'daily-five'
        ? {
            ...(input.result.equity === undefined ? {} : { equity: input.result.equity }),
            ...(input.result.returnPct === undefined ? {} : { returnPct: input.result.returnPct }),
            ...(input.result.comparison === undefined
              ? {}
              : { comparison: input.result.comparison }),
          }
        : input.result.winner === undefined
          ? {}
          : { winner: input.result.winner }),
    };
    const row = {
      share_id: shareId,
      owner_player_id: owner,
      activity: result.activity,
      created_at: createdAt,
      public_payload: stableJson(result),
      target_match_id: input.targetMatchId ?? null,
      role_swap: input.roleSwap ? 1 : 0,
      practice_only: input.practiceOnly ? 1 : 0,
    } as const;
    progressionTransaction(this.db, () => insertProgressionShare(this.db, row));
    return {
      result,
      roleSwap: row.role_swap === 1,
      practiceOnly: row.practice_only === 1,
    };
  }

  /** Returns a sanitized share without requiring the owner's session. */
  readShare(shareId: string): ShareResult {
    const row = readProgressionShare(this.db, requireText(shareId, 'Share id'));
    if (!row) throw new ProgressionError('NOT_FOUND', 'Share not found.', 404);
    return JSON.parse(row.public_payload) as ShareResult;
  }

  /** Returns internal rematch metadata for the coordinator without exposing it to share readers. */
  readShareLink(shareId: string): ProgressionLink {
    const row = readProgressionShare(this.db, requireText(shareId, 'Share id'));
    if (!row) throw new ProgressionError('NOT_FOUND', 'Share not found.', 404);
    return {
      shareId: row.share_id,
      activity: row.activity,
      roleSwap: row.role_swap === 1,
      practiceOnly: row.practice_only === 1,
      href: `/share/${encodeURIComponent(row.share_id)}`,
    };
  }

  /** Creates an opaque practice-only Hunt rematch link with optional role swap metadata. */
  createHuntRematchLink(input: {
    readonly ownerPlayerId: string;
    readonly matchId: string;
    readonly roleSwap?: boolean;
  }): ProgressionLink {
    const share = this.createShare({
      ownerPlayerId: input.ownerPlayerId,
      result: { shareId: '', activity: 'hunt', createdAt: this.now().toISOString() },
      targetMatchId: requireText(input.matchId, 'Match id'),
      roleSwap: input.roleSwap ?? true,
      practiceOnly: true,
    });
    return this.readShareLink(share.result.shareId);
  }

  private now(): Date {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      throw new ProgressionError('INVALID_RESULT', 'A valid progression clock is required.', 500);
    return value;
  }

  private normalizeDaily(input: DailyProgressionInput): NormalizedDaily {
    if ((input as unknown as { finalized?: boolean }).finalized === false)
      throw new ProgressionError(
        'INVALID_RESULT',
        'Only finalized Daily Five results can enter progression.',
        400,
      );
    const playerId = requireText(input.playerId, 'Player identity');
    const attemptId = requireText(input.attemptId, 'Attempt id');
    const dailyId = requireText(input.dailyId, 'Daily id');
    const variantId = requireText(input.variantId, 'Variant id');
    const completedAt = validInstant(input.completedAt, 'Completion time');
    const result = input.finalResult ?? input.result ?? null;
    if (!result && input.finalized !== true)
      throw new ProgressionError(
        'INVALID_RESULT',
        'A finalized Daily Five result payload is required.',
        400,
      );
    if (result && result.phase !== 'final-result')
      throw new ProgressionError(
        'INVALID_RESULT',
        'Only the final Daily Five phase can enter progression.',
        400,
      );
    const derived = result
      ? derivedDailyAccuracy(result)
      : { correctDirections: 0, directionalTrades: 0 };
    const directionalTrades = validCount(
      input.directionalTrades ?? derived.directionalTrades,
      'Directional trade count',
      5,
    );
    const correctDirections = validCount(
      input.correctDirections ?? derived.correctDirections,
      'Correct direction count',
      directionalTrades,
    );
    const equity = validMoney(input.equity ?? result?.totalEquity, 'Final equity');
    const returnPct = requireText(input.returnPct ?? result?.returnPct, 'Final return');
    const cohortId = requireText(input.cohortId ?? result?.cohort, 'Cohort id');
    const rulesVersion = input.rulesVersion ?? 'daily-five-v1';
    const payload = stableJson({
      attemptId,
      dailyId,
      mode: input.mode,
      completedAt,
      variantId,
      cohortId,
      equity,
      returnPct,
      correctDirections,
      directionalTrades,
      result,
    });
    return {
      result,
      row: {
        attempt_id: attemptId,
        player_id: playerId,
        daily_id: dailyId,
        mode: input.mode,
        completed_at: completedAt,
        equity,
        return_pct: returnPct,
        rules_version: rulesVersion,
        variant_id: variantId,
        cohort_id: cohortId,
        correct_directions: correctDirections,
        directional_trades: directionalTrades,
        finalized_payload: payload,
        created_at: this.now().toISOString(),
      },
    };
  }

  private normalizeHunt(input: HuntProgressionInput): NormalizedHunt {
    if ((input as unknown as { finalized?: boolean }).finalized === false)
      throw new ProgressionError(
        'INVALID_RESULT',
        'Only finalized Hunt results can enter progression.',
        400,
      );
    const playerId = requireText(input.playerId, 'Player identity');
    const matchId = requireText(input.matchId, 'Match id');
    const completedAt = validInstant(input.completedAt, 'Completion time');
    const resolution = input.resolution;
    const reveal = input.reveal ?? resolution?.reveal;
    const scores = input.scores ?? resolution?.scores;
    if (!reveal && !scores && input.finalized !== true)
      throw new ProgressionError(
        'INVALID_RESULT',
        'A finalized Hunt result payload is required.',
        400,
      );
    if (reveal?.winner === 'voided')
      throw new ProgressionError(
        'INVALID_RESULT',
        'Voided Hunt matches do not award progression.',
        400,
      );
    const tracerRole = input.role === 'tracer' || input.role === 'captain';
    const won = input.won ?? reveal?.winner === (tracerRole ? 'tracers' : 'whale');
    const finalPairCorrect =
      input.finalPairCorrect ?? scores?.finalPairCorrect ?? reveal?.reason === 'targets-identified';
    const correctPairBeforeFinal = input.correctPairBeforeFinal ?? false;
    const finalIncludesDecoy = input.finalIncludesDecoy ?? pairIncludesDecoy(reveal, undefined);
    const payload = stableJson({
      matchId,
      playerId,
      completedAt,
      role: input.role,
      matchKind: input.matchKind,
      maxTracers: input.maxTracers,
      won,
      finalPairCorrect,
      correctPairBeforeFinal,
      finalIncludesDecoy,
      reveal,
      scores,
    });
    return {
      row: {
        match_id: matchId,
        player_id: playerId,
        completed_at: completedAt,
        role: input.role,
        won: won ? 1 : 0,
        rules_version: input.rulesVersion ?? 'hunt-v1',
        match_kind: input.matchKind,
        max_tracers: input.maxTracers,
        final_pair_correct: finalPairCorrect ? 1 : 0,
        correct_pair_before_final: correctPairBeforeFinal ? 1 : 0,
        final_includes_decoy: finalIncludesDecoy ? 1 : 0,
        finalized_payload: payload,
        created_at: this.now().toISOString(),
      },
    };
  }

  private comparison(
    own: ProgressionDailyRow,
    entries: readonly ProgressionDailyRow[],
    scope: 'exact-variant' | 'cohort',
    scopeId: string,
  ): ResultComparison {
    const eligible = [...entries].sort((left, right) => {
      const difference = parseMoney(right.equity) - parseMoney(left.equity);
      return difference === 0n
        ? left.attempt_id.localeCompare(right.attempt_id)
        : difference > 0n
          ? 1
          : -1;
    });
    const greater = eligible.filter(
      (entry) => parseMoney(entry.equity) > parseMoney(own.equity),
    ).length;
    const included = eligible.some((entry) => entry.attempt_id === own.attempt_id);
    const rank = included ? greater + 1 : null;
    const eligibleAttempts = eligible.length;
    const percentile =
      rank !== null && canShowPercentile(eligibleAttempts)
        ? (((eligibleAttempts - rank) / eligibleAttempts) * 100).toFixed(2)
        : null;
    return {
      scope:
        scope === 'exact-variant'
          ? { kind: 'exact-variant', variantId: scopeId }
          : { kind: 'cohort', cohortId: scopeId },
      equity: own.equity as Money,
      rank,
      eligibleAttempts,
      percentile,
      note: comparisonNote(scope, scopeId, own.cohort_id, eligibleAttempts),
    };
  }

  private award(playerId: string, badgeId: ProgressionBadgeId): void {
    if (!badgeDefinition(badgeId)) throw new Error(`Unknown progression badge ${badgeId}.`);
    insertProgressionBadge(this.db, {
      player_id: playerId,
      badge_id: badgeId,
      earned_at: this.now().toISOString(),
    });
  }
}

export { BADGE_DEFINITIONS };
