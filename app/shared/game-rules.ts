/**
 * Shared rule values and serialization primitives.
 *
 * Official money and price values cross the transport as fixed-point strings.
 * That keeps browser formatting and server settlement from silently changing
 * a value because of binary floating-point arithmetic.
 */

export type OpaqueId = string;
export type IdempotencyKey = string;

export type Money = string & { readonly __moneyFixedPoint: unique symbol };
export type Price = string & { readonly __priceFixedPoint: unique symbol };

export const FIXED_POINT = {
  money: { scale: 2, unit: 'cent' },
  price: { scale: 8, unit: '1e-8 price unit' },
  rounding: 'half-away-from-zero',
} as const;

function parseFixed(value: string, scale: number, label: string): bigint {
  if (typeof value !== 'string') throw new Error(`${label} must be a fixed-point string.`);
  const match = new RegExp(`^(-?)(\\d+)\\.(\\d{${scale}})$`).exec(value);
  if (!match) throw new Error(`${label} must have exactly ${scale} decimal places.`);
  const sign = match[1] === '-' ? -1n : 1n;
  return sign * BigInt(`${match[2]}${match[3]}`);
}

function formatFixed(units: bigint, scale: number): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const text = absolute.toString().padStart(scale + 1, '0');
  const split = text.length - scale;
  return `${negative ? '-' : ''}${text.slice(0, split)}.${text.slice(split)}`;
}

/** Parse and validate a serialized money value. */
export function parseMoney(value: string): bigint {
  return parseFixed(value, FIXED_POINT.money.scale, 'Money');
}

/** Parse and validate a serialized positive or negative price value. */
export function parsePrice(value: string): bigint {
  return parseFixed(value, FIXED_POINT.price.scale, 'Price');
}

/** Create a serialized money value from its integer cent amount. */
export function moneyFromCents(units: bigint): Money {
  return formatFixed(units, FIXED_POINT.money.scale) as Money;
}

/** Create a serialized price value from its integer 1e-8 price amount. */
export function priceFromUnits(units: bigint): Price {
  return formatFixed(units, FIXED_POINT.price.scale) as Price;
}

/** Validate a money string without converting it to a floating-point number. */
export function money(value: string): Money {
  parseMoney(value);
  return value as Money;
}

/** Validate a price string without converting it to a floating-point number. */
export function price(value: string): Price {
  parsePrice(value);
  return value as Price;
}

/**
 * Divide integer fixed-point quantities using the one rounding rule used by
 * official settlement: ties round away from zero.
 */
export function roundQuotient(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('A positive denominator is required.');
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || (remainder < 0n ? -remainder : remainder) * 2n < denominator)
    return quotient;
  return quotient + (numerator < 0n ? -1n : 1n);
}

export interface DailyFiveRules {
  readonly version: 'daily-five-v1';
  readonly totalRounds: number;
  readonly candidatesPerRound: 5;
  readonly startingCapital: Money;
  readonly roundStake: Money;
  readonly clueUnlocksPerRound: 3;
  readonly minLeverage: 1;
  readonly maxLeverage: 100;
  readonly historicalLookbackHours: 6;
  readonly outcomeWindowHours: 1;
  readonly candleIntervalMinutes: 5;
  readonly dailyReset: '00:00Z';
}

/**
 * The allocation rules used by the repaired Daily Five experience.  This is
 * intentionally a separate contract so a saved leveraged v1 ticket can still
 * be resumed and settled under the rules it was created with.
 */
export interface DailyFiveV2Rules {
  readonly version: 'daily-five-v2';
  readonly totalRounds: number;
  readonly candidatesPerRound: 5;
  readonly startingCapital: Money;
  readonly roundStake: Money;
  readonly clueUnlocksPerRound: 3;
  readonly allocationStepBps: 100;
  readonly maxAllocationBps: 10_000;
  readonly minLeverage?: number;
  readonly maxLeverage?: number;
  readonly entryFeeBps: 5;
  readonly exitFeeBps: 5;
  readonly historicalLookbackHours: 6;
  readonly outcomeWindowHours: 1;
  readonly candleIntervalMinutes: 5;
  readonly dailyReset: '00:00Z';
  readonly cohort: 'daily-five-v2';
}

export const DAILY_FIVE_RULES: DailyFiveRules = {
  version: 'daily-five-v1',
  totalRounds: 5,
  candidatesPerRound: 5,
  startingCapital: money('50000.00'),
  roundStake: money('10000.00'),
  clueUnlocksPerRound: 3,
  minLeverage: 1,
  maxLeverage: 100,
  historicalLookbackHours: 6,
  outcomeWindowHours: 1,
  candleIntervalMinutes: 5,
  dailyReset: '00:00Z',
};

export const DAILY_FIVE_V2_RULES: DailyFiveV2Rules = {
  version: 'daily-five-v2',
  totalRounds: 5,
  candidatesPerRound: 5,
  startingCapital: money('10000.00'),
  roundStake: money('10000.00'),
  clueUnlocksPerRound: 3,
  allocationStepBps: 100,
  maxAllocationBps: 10_000,
  minLeverage: 1,
  maxLeverage: 100,
  entryFeeBps: 5,
  exitFeeBps: 5,
  historicalLookbackHours: 6,
  outcomeWindowHours: 1,
  candleIntervalMinutes: 5,
  dailyReset: '00:00Z',
  cohort: 'daily-five-v2',
};

export type ErrorCode =
  | 'INVALID_COMMAND'
  | 'INVALID_PHASE'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'STALE_STATE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DUPLICATE_COMMAND'
  | 'UNAVAILABLE';

export interface ApiError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly stateVersion?: number;
}

export interface CommandMeta {
  readonly expectedStateVersion: number;
  readonly idempotencyKey: IdempotencyKey;
}

export const COMMAND_SEMANTICS = {
  stateVersion:
    'Every mutating command carries the version it observed; a mismatch returns STALE_STATE.',
  idempotency:
    'The first command for a key stores its response. Repeating the same key and payload replays that response; reusing the key with another payload returns IDEMPOTENCY_CONFLICT.',
  phase:
    'Each command is accepted only in its declared server phase; otherwise the server returns INVALID_PHASE.',
  serverAuthority:
    'Stake, execution prices, hidden outcomes, deadlines, awards, and phase changes are server-owned.',
} as const;
