import type {
  DailyPortfolioContribution,
  DailyPortfolioDecision,
  DailyTicketResult,
} from '../../../shared/daily-five.js';
import type { DailyFiveV2Rules, Money, Price } from '../../../shared/game-rules.js';
import {
  moneyFromCents,
  parseMoney,
  parsePrice,
  priceFromUnits,
  roundQuotient,
} from '../../../shared/game-rules.js';
import { privateAssetIdentity, type DailyFivePrivateCandidate } from './types.js';

const BASIS_POINTS = 10_000n;

function returnPct(equity: bigint, allocated: bigint): string {
  if (allocated === 0n) return '0.00';
  const basisPoints = roundQuotient((equity - allocated) * BASIS_POINTS, allocated);
  const negative = basisPoints < 0n;
  const absolute = negative ? -basisPoints : basisPoints;
  return `${negative ? '-' : ''}${(absolute / 100n).toString()}.${(absolute % 100n)
    .toString()
    .padStart(2, '0')}`;
}

function latestClosed(candidate: DailyFivePrivateCandidate): { entry: Price; exit: Price } {
  const first = candidate.candles[0];
  const last = [...candidate.candles].reverse().find((candle) => candle.closed !== false);
  if (!first || !last) throw new Error('A portfolio asset needs an executable candle window.');
  const entry = first.open;
  const exit = last.close;
  if (parsePrice(entry) <= 0n || parsePrice(exit) <= 0n)
    throw new Error('A portfolio asset needs positive entry and exit prices.');
  return { entry, exit };
}

/** Validates the integer basis-point portfolio boundary for Daily Five v2. */
export function validatePortfolioDecision(
  value: unknown,
  round: { roundIndex: number; candidates: readonly { assetId: string }[] },
  rules: DailyFiveV2Rules,
): DailyPortfolioDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A Daily Five portfolio is required.');
  const command = value as {
    kind?: unknown;
    roundIndex?: unknown;
    allocations?: unknown;
    cashWeightBps?: unknown;
  };
  if (command.kind !== 'portfolio' || command.roundIndex !== round.roundIndex)
    throw new Error('Choose a portfolio for the current round.');
  if (!Array.isArray(command.allocations) || command.allocations.length > round.candidates.length)
    throw new Error('A portfolio can contain at most one entry per candidate.');
  if (
    typeof command.cashWeightBps !== 'number' ||
    !Number.isInteger(command.cashWeightBps) ||
    command.cashWeightBps < 0 ||
    command.cashWeightBps > rules.maxAllocationBps
  )
    throw new Error('Cash must be an integer allocation from 0% through 100%.');
  const allowed = new Set(round.candidates.map((candidate) => candidate.assetId));
  const seen = new Set<string>();
  let total = command.cashWeightBps;
  const allocations = command.allocations.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Each portfolio allocation must name an asset and weight.');
    const allocation = entry as { assetId?: unknown; weightBps?: unknown; leverage?: unknown };
    if (
      typeof allocation.assetId !== 'string' ||
      !allowed.has(allocation.assetId) ||
      seen.has(allocation.assetId)
    )
      throw new Error('Portfolio assets must be known and unique.');
    if (
      typeof allocation.weightBps !== 'number' ||
      !Number.isInteger(allocation.weightBps) ||
      allocation.weightBps < 0 ||
      allocation.weightBps > rules.maxAllocationBps ||
      allocation.weightBps % rules.allocationStepBps !== 0
    )
      throw new Error('Asset allocations must use whole percentage points from 0% through 100%.');
    seen.add(allocation.assetId);
    total += allocation.weightBps;
    const minLeverage = rules.minLeverage ?? 1;
    const maxLeverage = rules.maxLeverage ?? 100;
    if (
      allocation.leverage !== undefined &&
      (typeof allocation.leverage !== 'number' ||
        !Number.isInteger(allocation.leverage) ||
        allocation.leverage < minLeverage ||
        allocation.leverage > maxLeverage)
    )
      throw new Error(
        `Leverage must be a whole number from ${minLeverage}× through ${maxLeverage}×.`,
      );
    return {
      assetId: allocation.assetId,
      weightBps: allocation.weightBps,
      ...(allocation.leverage === undefined ? {} : { leverage: allocation.leverage }),
    };
  });
  if (total !== rules.maxAllocationBps)
    throw new Error('Asset allocations plus cash must total exactly 100%.');
  return { kind: 'portfolio', allocations, cashWeightBps: command.cashWeightBps };
}

interface PortfolioSettlement {
  readonly endingEquity: Money;
  readonly cashEndingEquity: Money;
  readonly totalCosts: Money;
  readonly contributions: readonly DailyPortfolioContribution[];
  readonly liquidated: boolean;
}

/** Settles each long only allocation with the shared integer cent rule. */
export function settlePortfolio(
  decision: DailyPortfolioDecision,
  candidates: readonly DailyFivePrivateCandidate[],
  stake: Money,
  rules: DailyFiveV2Rules,
): PortfolioSettlement {
  const stakeCents = parseMoney(stake);
  const byId = new Map(candidates.map((candidate) => [candidate.assetId, candidate]));
  let allocatedTotal = 0n;
  let totalCosts = 0n;
  let investedEquity = 0n;
  const contributions: DailyPortfolioContribution[] = [];
  for (const allocation of decision.allocations) {
    if (allocation.weightBps === 0) continue;
    const candidate = byId.get(allocation.assetId);
    if (!candidate) throw new Error('The selected portfolio asset has no private outcome.');
    const { entry, exit } = latestClosed(candidate);
    const entryUnits = parsePrice(entry);
    const exitUnits = parsePrice(exit);
    const allocated = roundQuotient(stakeCents * BigInt(allocation.weightBps), BASIS_POINTS);
    const leverage = allocation.leverage ?? 1;
    const grossPnl = roundQuotient(
      allocated * BigInt(leverage) * (exitUnits - entryUnits),
      entryUnits,
    );
    const cost = roundQuotient(
      allocated * BigInt(rules.entryFeeBps + rules.exitFeeBps),
      BASIS_POINTS,
    );
    const ending = allocated + grossPnl - cost;
    allocatedTotal += allocated;
    totalCosts += cost;
    const liquidated = ending <= 0n;
    const settledEnding = liquidated ? 0n : ending;
    investedEquity += settledEnding;
    const identity = privateAssetIdentity(candidate);
    contributions.push({
      assetId: allocation.assetId,
      ...identity,
      weightBps: allocation.weightBps,
      leverage,
      allocated: moneyFromCents(allocated),
      grossPnl: moneyFromCents(grossPnl),
      cost: moneyFromCents(cost),
      endingEquity: moneyFromCents(settledEnding),
      assetReturnPct: returnPct(exitUnits, entryUnits),
      leveragedReturnPct: returnPct(settledEnding, allocated),
      returnPct: returnPct(settledEnding, allocated),
      entryPrice: entry,
      exitPrice: exit,
      outcomeChart: candidate.candles.map((candle) => ({ at: candle.at, value: candle.close })),
      liquidated,
    });
  }
  const cash = stakeCents - allocatedTotal;
  if (cash < 0n) throw new Error('Portfolio allocations exceed the round stake.');
  return {
    endingEquity: moneyFromCents(cash + investedEquity),
    cashEndingEquity: moneyFromCents(cash),
    totalCosts: moneyFromCents(totalCosts),
    contributions,
    liquidated: contributions.some((contribution) => contribution.liquidated),
  };
}

/** Creates the saved result for one atomic v2 portfolio lock. */
export function lockPortfolio(
  roundIndex: number,
  decision: DailyPortfolioDecision,
  candidates: readonly DailyFivePrivateCandidate[],
  rules: DailyFiveV2Rules,
  stake: Money = rules.roundStake,
): DailyTicketResult {
  const settlement = settlePortfolio(decision, candidates, stake, rules);
  const stakeCents = parseMoney(stake);
  const resultCents = parseMoney(settlement.endingEquity);
  const totalReturn =
    stakeCents === 0n ? 0n : roundQuotient((resultCents - stakeCents) * BASIS_POINTS, stakeCents);
  const negative = totalReturn < 0n;
  const absolute = negative ? -totalReturn : totalReturn;
  const returnValue = `${negative ? '-' : ''}${(absolute / 100n).toString()}.${(absolute % 100n)
    .toString()
    .padStart(2, '0')}`;
  return {
    roundIndex,
    decision,
    stake,
    endingEquity: settlement.endingEquity,
    returnPct: returnValue,
    liquidated: settlement.liquidated,
    cashEndingEquity: settlement.cashEndingEquity,
    totalCosts: settlement.totalCosts,
    contributions: settlement.contributions,
    explanation:
      stakeCents === 0n
        ? 'The cumulative wallet was already at $0.00, so this round stayed in cash.'
        : 'Each allocation settled from its declared entry price to the last closed candle; the remaining wallet stayed in cash.',
  };
}

/** Regression helper for the documented $10,015 two asset example. */
export function examplePortfolioResult(): Money {
  const a = roundQuotient(200_000n * 10_400n, 10_000n);
  const c = roundQuotient(300_000n * 9_800n, 10_000n);
  const cost = roundQuotient(2_000_00n * 10n, 10_000n) + roundQuotient(3_000_00n * 10n, 10_000n);
  return moneyFromCents(1_000_000n + (a - 200_000n) + (c - 300_000n) - cost);
}

export const PORTFOLIO_ENTRY_PRICE_SENTINEL = priceFromUnits(1n);
