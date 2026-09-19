import type { Weights } from '../../shared/types.js';

export const START_CASH = 10_000;
export const COSTS = { entry: 0.003, exit: 0.003, version: 'costs-v1' } as const;

export function validateWeights(value: unknown): Weights {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some(
      (n) => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100 || n % 10 !== 0,
    ) ||
    value.reduce((a, b) => a + b, 0) !== 100
  ) {
    throw new Error('Allocate exactly 100% across tokens and cash, in 10% steps.');
  }
  return value as Weights;
}

export function terminalMultiplier(entry: number | null, exit: number | null): number {
  if (
    entry === null ||
    exit === null ||
    !Number.isFinite(entry) ||
    !Number.isFinite(exit) ||
    entry <= 0 ||
    exit <= 0
  )
    throw new Error('Complete positive settlement prices are required.');
  return ((exit / entry) * (1 - COSTS.exit)) / (1 + COSTS.entry);
}

export function scoreAllocation(
  weights: Weights,
  prices: { entry: number; exit: number }[],
  startCash = START_CASH,
) {
  validateWeights(weights);
  if (prices.length !== 3 || !Number.isFinite(startCash) || startCash <= 0)
    throw new Error('Three assets and a positive starting balance are required.');
  const multipliers = prices.map(({ entry, exit }) => terminalMultiplier(entry, exit));
  const multiplier =
    weights[3] / 100 +
    multipliers.reduce((sum, factor, index) => sum + (factor * weights[index]!) / 100, 0);
  const benchmarkMultiplier = multipliers.reduce((sum, factor) => sum + factor, 0) / 3;
  return {
    endEquity: startCash * multiplier,
    returnPct: (multiplier - 1) * 100,
    benchmarkPct: (benchmarkMultiplier - 1) * 100,
  };
}
