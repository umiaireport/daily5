import type {
  EvidenceAvailability,
  PublicAssetEvidence,
  RevealedClue,
  UnopenedClueDescriptor,
} from './evidence.js';
import type {
  CommandMeta,
  DailyFiveRules,
  IdempotencyKey,
  Money,
  OpaqueId,
  Price,
  DailyFiveV2Rules,
} from './game-rules.js';

export type DailyPhase =
  'available' | 'round-open' | 'saved-result' | 'acknowledge-next' | 'final-result';

export interface DailyRoundPublic {
  readonly roundIndex: number;
  readonly cutoffAt: string;
  readonly candidates: readonly PublicAssetEvidence[];
  readonly evidence: EvidenceAvailability;
  readonly unlocksRemaining: number;
}

export type DailyPublicRules = DailyFiveRules | DailyFiveV2Rules;

export interface DailyFivePublic {
  readonly dailyId: OpaqueId;
  readonly rules: DailyPublicRules;
  readonly rounds: readonly DailyRoundPublic[];
  readonly publishedAt: string;
}

export interface StartDailyFiveCommand {
  readonly idempotencyKey: IdempotencyKey;
  readonly mode?: 'official' | 'practice';
}

export interface ResumeDailyFiveCommand {
  readonly attemptId: OpaqueId;
}

export interface UnlockDailyClueCommand extends CommandMeta {
  readonly kind: 'unlock-clue';
  readonly roundIndex: number;
  readonly assetId: OpaqueId;
  readonly clueId: OpaqueId;
}

export interface SubmitDailyTradeCommand extends CommandMeta {
  readonly kind: 'trade';
  readonly roundIndex: number;
  readonly assetId: OpaqueId;
  readonly side: 'long' | 'short';
  readonly leverage: number;
}

export interface SubmitDailyCashCommand extends CommandMeta {
  readonly kind: 'cash';
  readonly roundIndex: number;
}

export interface DailyPortfolioAllocation {
  readonly assetId: OpaqueId;
  readonly weightBps: number;
  /** Optional for compatibility with saved unleveraged v2 drafts. */
  readonly leverage?: number;
}

export interface SubmitDailyPortfolioCommand extends CommandMeta {
  readonly kind: 'portfolio';
  readonly roundIndex: number;
  readonly allocations: readonly DailyPortfolioAllocation[];
  readonly cashWeightBps: number;
}

export type SubmitDailyDecisionCommand =
  SubmitDailyTradeCommand | SubmitDailyCashCommand | SubmitDailyPortfolioCommand;

export interface ContinueDailyCommand extends CommandMeta {
  readonly kind: 'continue';
  readonly roundIndex: number;
}

export interface DailyTradeDecision {
  readonly kind: 'trade';
  readonly assetId: OpaqueId;
  readonly side: 'long' | 'short';
  readonly leverage: number;
}

export interface DailyCashDecision {
  readonly kind: 'cash';
}

export interface DailyPortfolioDecision {
  readonly kind: 'portfolio';
  readonly allocations: readonly DailyPortfolioAllocation[];
  readonly cashWeightBps: number;
}

export type DailyTicketDecision = DailyTradeDecision | DailyCashDecision | DailyPortfolioDecision;

export interface DailyPortfolioContribution {
  readonly assetId: OpaqueId;
  /** Released with the saved round result; never included in the open-round view. */
  readonly assetName?: string;
  readonly assetSymbol?: string;
  readonly weightBps: number;
  readonly leverage?: number;
  readonly allocated: Money;
  readonly grossPnl: Money;
  readonly cost: Money;
  readonly endingEquity: Money;
  /** Unleveraged underlying asset move from the real entry candle to exit candle. */
  readonly assetReturnPct?: string;
  /** Net position return after the declared leverage and round-trip costs. */
  readonly leveragedReturnPct?: string;
  readonly returnPct: string;
  readonly entryPrice?: Price;
  readonly exitPrice?: Price;
  readonly outcomeChart?: readonly { at: string; value: Price }[];
  readonly liquidated?: boolean;
}

export interface DailyTicketResult {
  readonly roundIndex: number;
  readonly decision: DailyTicketDecision;
  /** Released with the saved round result for legacy single-asset tickets. */
  readonly assetName?: string;
  readonly assetSymbol?: string;
  readonly stake: Money;
  readonly entryPrice?: Price;
  readonly exitPrice?: Price;
  readonly endingEquity: Money;
  readonly returnPct: string;
  readonly liquidated: boolean;
  readonly explanation: string;
  readonly cashEndingEquity?: Money;
  readonly totalCosts?: Money;
  readonly contributions?: readonly DailyPortfolioContribution[];
}

export interface DailySavedResult {
  readonly phase: 'saved-result';
  readonly stateVersion: number;
  readonly result: DailyTicketResult;
  readonly next: 'continue';
}

export interface DailyFinalResult {
  readonly phase: 'final-result';
  readonly stateVersion: number;
  /** Normally five tickets; a v2 run can end early when its wallet reaches zero. */
  readonly tickets: readonly DailyTicketResult[];
  readonly endedEarly?: boolean;
  readonly endReason?: 'no-funds';
  readonly totalEquity: Money;
  readonly returnPct: string;
  readonly cohort: string;
}

export interface DailyAttemptView {
  readonly mode?: 'official' | 'practice';
  readonly attemptId: OpaqueId;
  readonly dailyId: OpaqueId;
  /** Rules are returned with a saved attempt so older versions remain playable after a new day ships. */
  readonly rules?: DailyFivePublic['rules'];
  readonly phase: DailyPhase;
  readonly stateVersion: number;
  readonly currentRoundIndex: number | null;
  /** Current cumulative wallet for the v2 experience. Optional for older saved attempts. */
  readonly currentWallet?: Money;
  readonly round: DailyRoundPublic | null;
  readonly savedResult: DailySavedResult | null;
  readonly finalResult: DailyFinalResult | null;
}

export interface DailyFiveTransport {
  getToday(): Promise<DailyFivePublic>;
  start(command: StartDailyFiveCommand): Promise<DailyAttemptView>;
  resume(command: ResumeDailyFiveCommand): Promise<DailyAttemptView>;
  unlock(attemptId: OpaqueId, command: UnlockDailyClueCommand): Promise<DailyAttemptView>;
  submit(attemptId: OpaqueId, command: SubmitDailyDecisionCommand): Promise<DailyAttemptView>;
  continue(attemptId: OpaqueId, command: ContinueDailyCommand): Promise<DailyAttemptView>;
}

export const DAILY_FIVE_ROUTES = {
  today: 'GET /api/daily-five/today',
  attempts: 'POST /api/daily-five/:id/attempts',
  attempt: 'GET /api/daily-five/attempts/:id',
  clues: 'POST /api/daily-five/attempts/:id/clues',
  tickets: 'POST /api/daily-five/attempts/:id/tickets',
  continue: 'POST /api/daily-five/attempts/:id/continue',
  leaderboard: 'GET /api/daily-five/:id/leaderboard',
} as const;

export type DailyClueContract = UnopenedClueDescriptor | RevealedClue;
