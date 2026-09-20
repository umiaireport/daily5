import type { DailyFinalResult } from '../../../shared/daily-five.js';
import type { HuntFinalResolution, HuntMatchScores } from '../hunt/types.js';
import type { HuntReveal } from '../../../shared/hunt.js';
import type {
  ComparisonScope,
  ProgressionView,
  ResultComparison,
  ShareResult,
} from '../../../shared/progression.js';
import type { Money } from '../../../shared/game-rules.js';

export type ProgressionDailyMode = 'official' | 'practice';
export type ProgressionHuntRole = 'whale' | 'tracer' | 'captain';
export type ProgressionMatchKind = 'human' | 'computer' | 'substituted';

export interface DailyProgressionInput {
  readonly playerId: string;
  readonly attemptId: string;
  readonly dailyId: string;
  readonly mode: ProgressionDailyMode;
  readonly completedAt: string;
  readonly variantId: string;
  readonly cohortId?: string;
  readonly result?: DailyFinalResult;
  /** Alias accepted by integration callers that name the saved contract explicitly. */
  readonly finalResult?: DailyFinalResult;
  readonly equity?: Money | string;
  readonly returnPct?: string;
  readonly correctDirections?: number;
  readonly directionalTrades?: number;
  readonly rulesVersion?: 'daily-five-v1' | 'daily-five-v2';
  /** A false value is always rejected; completion methods otherwise represent finalized rows. */
  readonly finalized?: true;
}

export interface HuntProgressionInput {
  readonly playerId: string;
  readonly matchId: string;
  readonly completedAt: string;
  readonly role: ProgressionHuntRole;
  readonly matchKind: ProgressionMatchKind;
  readonly maxTracers: 1 | 5;
  readonly resolution?: HuntFinalResolution;
  readonly reveal?: HuntReveal;
  readonly scores?: HuntMatchScores;
  readonly won?: boolean;
  readonly finalPairCorrect?: boolean;
  readonly correctPairBeforeFinal?: boolean;
  readonly finalIncludesDecoy?: boolean;
  readonly rulesVersion?: 'hunt-v1';
  readonly finalized?: true;
}

export interface DailyComparisonRequest {
  readonly playerId: string;
  readonly dailyId: string;
  readonly scope?: 'exact-variant' | 'cohort';
  readonly variantId?: string;
  readonly cohortId?: string;
}

export interface ProgressionShareInput {
  readonly ownerPlayerId: string;
  readonly result: ShareResult;
  readonly targetMatchId?: string;
  readonly roleSwap?: boolean;
  readonly practiceOnly?: boolean;
}

export interface ProgressionLink {
  readonly shareId: string;
  readonly activity: 'daily-five' | 'hunt';
  readonly roleSwap: boolean;
  readonly practiceOnly: boolean;
  readonly href: string;
}

export interface ProgressionServiceOptions {
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export interface ProgressionSnapshot extends ProgressionView {
  readonly dailyComparison?: ResultComparison;
}

export interface PublicShareRecord {
  readonly result: ShareResult;
  readonly roleSwap: boolean;
  readonly practiceOnly: boolean;
}

export type { ComparisonScope };
