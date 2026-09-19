import type {
  DailyFinalResult,
  DailyTicketDecision,
  DailyTicketResult,
  SubmitDailyDecisionCommand,
} from '../../../shared/daily-five.js';
import type { DailyFiveRules, DailyFiveV2Rules, Money } from '../../../shared/game-rules.js';
import {
  DAILY_FIVE_RULES,
  moneyFromCents,
  parseMoney,
  roundQuotient,
} from '../../../shared/game-rules.js';
import { evaluateCash, evaluatePosition } from './settlement.js';
import { privateAssetIdentity, type DailyFivePrivateCandidate } from './types.js';

/** Validates a server-bound trade or cash decision against the current public round. */
export function validateTicket(
  value: unknown,
  round: { roundIndex: number; candidates: readonly { assetId: string }[] },
  rules: DailyFiveRules = DAILY_FIVE_RULES,
): DailyTicketDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A Daily Five ticket is required.');
  const command = value as Partial<SubmitDailyDecisionCommand>;
  if (command.kind === 'cash') {
    if (command.roundIndex !== round.roundIndex)
      throw new Error('The ticket belongs to another round.');
    return { kind: 'cash' };
  }
  if (command.kind !== 'trade' || command.roundIndex !== round.roundIndex)
    throw new Error('Choose cash or one valid asset for this round.');
  if (
    typeof command.assetId !== 'string' ||
    !round.candidates.some((candidate) => candidate.assetId === command.assetId)
  )
    throw new Error('Choose one of the five assets in the current round.');
  if (command.side !== 'long' && command.side !== 'short')
    throw new Error('A trade must be long or short.');
  if (
    typeof command.leverage !== 'number' ||
    !Number.isInteger(command.leverage) ||
    command.leverage < rules.minLeverage ||
    command.leverage > rules.maxLeverage
  )
    throw new Error(
      `Leverage must be an integer from ${rules.minLeverage}× through ${rules.maxLeverage}×.`,
    );
  return {
    kind: 'trade',
    assetId: command.assetId,
    side: command.side,
    leverage: command.leverage,
  };
}

export interface LockTicketInput {
  readonly roundIndex: number;
  readonly decision: DailyTicketDecision;
  readonly candidate?: DailyFivePrivateCandidate;
  readonly stake?: Money;
  readonly rules?: DailyFiveRules;
}

/** Settles one immutable ticket immediately after its decision is accepted. */
export function lockTicket(input: LockTicketInput): DailyTicketResult {
  const rules = input.rules ?? DAILY_FIVE_RULES;
  const stake = input.stake ?? rules.roundStake;
  if (input.decision.kind === 'cash') {
    return {
      roundIndex: input.roundIndex,
      decision: input.decision,
      stake,
      endingEquity: evaluateCash(stake).endingEquity,
      returnPct: '0.00',
      liquidated: false,
      explanation: 'Cash held the isolated round stake for the historical outcome window.',
    };
  }
  if (input.decision.kind !== 'trade')
    throw new Error('A leveraged ticket cannot contain a portfolio decision.');
  if (!input.candidate || input.candidate.assetId !== input.decision.assetId)
    throw new Error('The selected asset has no private outcome window.');
  const identity = privateAssetIdentity(input.candidate);
  const settled = evaluatePosition({
    stake,
    side: input.decision.side,
    leverage: input.decision.leverage,
    candles: input.candidate.candles,
  });
  return {
    roundIndex: input.roundIndex,
    decision: input.decision,
    ...identity,
    stake,
    entryPrice: settled.entryPrice,
    exitPrice: settled.exitPrice,
    endingEquity: settled.endingEquity,
    returnPct: settled.returnPct,
    liquidated: settled.liquidated,
    explanation: settled.liquidated
      ? 'The position reached zero equity at an intraperiod adverse extreme and was liquidated.'
      : 'The position settled at the last closed candle of the historical outcome window.',
  };
}

export interface StageAdvance {
  readonly phase: 'round-open' | 'final-result';
  readonly currentRoundIndex: number | null;
}

/** Advances only from an acknowledged saved result to the next round or final result. */
export function advanceStage(
  phase: 'round-open' | 'saved-result' | 'final-result',
  currentRoundIndex: number | null,
  totalRounds = DAILY_FIVE_RULES.totalRounds,
): StageAdvance {
  if (phase !== 'saved-result' || currentRoundIndex === null)
    throw new Error('Only a saved ticket result can advance the Daily Five stage.');
  if (currentRoundIndex < totalRounds)
    return { phase: 'round-open', currentRoundIndex: currentRoundIndex + 1 };
  return { phase: 'final-result', currentRoundIndex: null };
}

/** Builds the immutable final result: v1 sums isolated tickets, v2 returns the carried wallet. */
export function finishAttempt(
  tickets: readonly DailyTicketResult[],
  cohort: string,
  stateVersion: number,
  rules: DailyFiveRules | DailyFiveV2Rules = DAILY_FIVE_RULES,
  endedEarly = false,
): DailyFinalResult {
  if (
    tickets.length < 1 ||
    tickets.length > rules.totalRounds ||
    (tickets.length !== rules.totalRounds && !endedEarly)
  )
    throw new Error('A Daily Five attempt needs a complete or explicitly ended result.');
  if (endedEarly && rules.version !== 'daily-five-v2')
    throw new Error('Only a v2 wallet can end a Daily Five attempt early.');
  if (endedEarly && parseMoney(tickets.at(-1)!.endingEquity) !== 0n)
    throw new Error('An early Daily Five result requires a zero wallet.');
  const ordered = [...tickets].sort((left, right) => left.roundIndex - right.roundIndex);
  if (ordered.some((ticket, index) => ticket.roundIndex !== index + 1))
    throw new Error('Daily Five ticket rounds must be complete and ordered.');
  const cumulative = rules.version === 'daily-five-v2';
  const totalCents = cumulative
    ? parseMoney(ordered.at(-1)!.endingEquity)
    : ordered.reduce((total, ticket) => total + parseMoney(ticket.endingEquity), 0n);
  const startingCents = parseMoney(rules.startingCapital);
  const roundedReturn = roundQuotient((totalCents - startingCents) * 10_000n, startingCents);
  const negative = roundedReturn < 0n;
  const absolute = negative ? -roundedReturn : roundedReturn;
  const returnPct = `${negative ? '-' : ''}${(absolute / 100n).toString()}.${(absolute % 100n)
    .toString()
    .padStart(2, '0')}`;
  return {
    phase: 'final-result',
    stateVersion,
    tickets: ordered,
    ...(endedEarly ? { endedEarly: true, endReason: 'no-funds' as const } : {}),
    totalEquity: moneyFromCents(totalCents),
    returnPct,
    cohort,
  };
}
