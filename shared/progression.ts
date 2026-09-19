import type { Money, OpaqueId } from './game-rules.js';

export type ActivityKind = 'daily-five' | 'hunt';

export interface ProgressionBadge {
  readonly badgeId: OpaqueId;
  readonly title: string;
  readonly description: string;
  readonly earnedAt: string;
}

export interface DailyHistoryEntry {
  readonly attemptId: OpaqueId;
  readonly completedAt: string;
  readonly equity: Money;
  readonly returnPct: string;
  readonly rulesVersion: 'daily-five-v1' | 'daily-five-v2';
  readonly variantId: OpaqueId;
}

export interface HuntHistoryEntry {
  readonly matchKind?: 'human' | 'computer' | 'substituted';
  readonly matchId: OpaqueId;
  readonly completedAt: string;
  readonly role: 'whale' | 'tracer' | 'captain';
  readonly won: boolean;
  readonly rulesVersion: 'hunt-v1';
}

export type ComparisonScope =
  | { readonly kind: 'exact-variant'; readonly variantId: OpaqueId }
  | { readonly kind: 'cohort'; readonly cohortId: OpaqueId };

export interface ResultComparison {
  readonly scope: ComparisonScope;
  readonly equity: Money;
  readonly rank: number | null;
  readonly eligibleAttempts: number;
  /** Only populated once at least twenty eligible attempts exist. */
  readonly percentile: string | null;
  readonly note: string;
}

export interface ProgressionView {
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly dailyHistory: readonly DailyHistoryEntry[];
  readonly huntHistory: readonly HuntHistoryEntry[];
  readonly badges: readonly ProgressionBadge[];
}

export interface ShareResult {
  readonly shareId: OpaqueId;
  readonly activity: ActivityKind;
  readonly createdAt: string;
  readonly equity?: Money;
  readonly returnPct?: string;
  readonly comparison?: ResultComparison;
  readonly winner?: 'whale' | 'tracers';
}

export function canShowPercentile(eligibleAttempts: number): boolean {
  return Number.isInteger(eligibleAttempts) && eligibleAttempts >= 20;
}

export const PROGRESSION_ROUTES = {
  history: 'GET /api/progression',
  comparison: 'GET /api/daily-five/:id/comparison',
  share: 'GET /api/shares/:id',
} as const;
