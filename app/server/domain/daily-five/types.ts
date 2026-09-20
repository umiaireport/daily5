import type {
  DailyFivePublic,
  DailyRoundPublic,
  DailyTicketResult,
} from '../../../shared/daily-five.js';
import type { RevealedClue } from '../../../shared/evidence.js';
import type { Price } from '../../../shared/game-rules.js';
import type { DailyCandle } from './settlement.js';

export interface DailyFivePrivateCandidate {
  readonly assetId: string;
  readonly variantId: string;
  readonly candles: readonly DailyCandle[];
  /** Optional redundant source value; settlement always verifies it against candles[0].open. */
  readonly entryPrice?: Price;
  readonly clues?: readonly RevealedClue[];
  readonly realAssetKey?: string;
  /** Private until settlement; the open-round projection must not expose it. */
  readonly realAssetName?: string;
  readonly realAssetSymbol?: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
}

/** Reads reveal-only identity while remaining compatible with older case packs. */
export function privateAssetIdentity(candidate: DailyFivePrivateCandidate): {
  readonly assetName?: string;
  readonly assetSymbol?: string;
} {
  if (candidate.realAssetName || candidate.realAssetSymbol)
    return {
      ...(candidate.realAssetName ? { assetName: candidate.realAssetName } : {}),
      ...(candidate.realAssetSymbol ? { assetSymbol: candidate.realAssetSymbol } : {}),
    };
  const synthetic = candidate.realAssetKey?.match(/^synthetic-asset-(\d+)-(\d+)$/);
  if (!synthetic) return {};
  const round = Number(synthetic[1]);
  const asset = Number(synthetic[2]) + 1;
  if (!Number.isInteger(round) || !Number.isInteger(asset)) return {};
  return {
    assetName: `Synthetic Asset ${round}-${asset}`,
    assetSymbol: `SYN${round}${asset}`,
  };
}

export interface DailyFivePrivateRound {
  readonly roundIndex: number;
  readonly candidates: readonly DailyFivePrivateCandidate[];
}

/** Public evidence and server-only outcome windows for one immutable daily case pack. */
export interface DailyFiveCasePack {
  readonly publicChallenge: DailyFivePublic;
  readonly privateRounds: readonly DailyFivePrivateRound[];
  readonly cohort: string;
}

export interface DailyFiveAssignment {
  readonly roundIndex: number;
  readonly candidateIds: readonly string[];
}

export interface DailyFiveAttemptState {
  readonly attemptId: string;
  readonly dailyId: string;
  readonly playerId: string;
  readonly mode: 'official' | 'practice';
  readonly phase: 'round-open' | 'saved-result' | 'final-result';
  readonly stateVersion: number;
  readonly currentRoundIndex: number | null;
  readonly assignments: readonly DailyFiveAssignment[];
  readonly finalResult: DailyFiveFinalState | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface DailyFiveFinalState {
  readonly tickets: readonly DailyTicketResult[];
  readonly endedEarly?: boolean;
  readonly endReason?: 'no-funds';
  readonly totalEquity: string;
  readonly returnPct: string;
  readonly cohort: string;
  readonly phase: 'final-result';
  readonly stateVersion: number;
}

export interface DailyFiveRoundSource {
  readonly publicRound: DailyRoundPublic;
  readonly candidates: readonly DailyFivePrivateCandidate[];
}

export interface DailyFiveCandidateOutcome {
  readonly entryPrice: Price;
  readonly candles: readonly DailyCandle[];
}

export function asDailyFiveRoundSource(
  challenge: DailyFivePublic,
  roundIndex: number,
  privateRound: DailyFivePrivateRound,
): DailyFiveRoundSource {
  const publicRound = challenge.rounds.find((round) => round.roundIndex === roundIndex);
  if (!publicRound) throw new Error(`Daily Five round ${roundIndex} is missing.`);
  return { publicRound, candidates: privateRound.candidates };
}
