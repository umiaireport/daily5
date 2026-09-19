import {
  DAILY_FIVE_RULES,
  moneyFromCents,
  parseMoney,
  parsePrice,
  priceFromUnits,
  roundQuotient,
  type DailyFiveRules,
  type Money,
  type Price,
} from '../../../shared/game-rules.js';

export const DAILY_FEE_BPS_PER_SIDE = 5n;
export const DAILY_TOTAL_FEE_BPS = DAILY_FEE_BPS_PER_SIDE * 2n;
const BASIS_POINTS = 10_000n;

/** A closed historical candle used only by server-owned settlement. */
export interface DailyCandle {
  readonly at: string;
  readonly open: Price;
  readonly high: Price;
  readonly low: Price;
  readonly close: Price;
  readonly closed?: boolean;
}

export interface DailyPosition {
  readonly stake?: Money;
  readonly entryPrice?: Price;
  readonly side: 'long' | 'short';
  readonly leverage: number;
  readonly candles: readonly DailyCandle[];
}

export interface DailyLiquidation {
  readonly candleIndex: number;
  readonly at: string;
  readonly price: Price;
  readonly equity: Money;
}

export interface DailyPositionResult {
  readonly entryPrice: Price;
  readonly exitPrice: Price;
  readonly endingEquity: Money;
  readonly returnPct: string;
  readonly liquidated: boolean;
  readonly liquidation: DailyLiquidation | null;
}

function assertPositivePrice(value: string, label: string): bigint {
  const parsed = parsePrice(value);
  if (parsed <= 0n) throw new Error(`${label} must be positive.`);
  return parsed;
}

function assertCandle(candle: DailyCandle, index: number): void {
  const at = Date.parse(candle.at);
  if (!Number.isFinite(at)) throw new Error(`Candle ${index} needs a valid timestamp.`);
  const open = assertPositivePrice(candle.open, `Candle ${index} open`);
  const high = assertPositivePrice(candle.high, `Candle ${index} high`);
  const low = assertPositivePrice(candle.low, `Candle ${index} low`);
  const close = assertPositivePrice(candle.close, `Candle ${index} close`);
  if (high < open || high < close || low > open || low > close || low > high)
    throw new Error(`Candle ${index} has impossible OHLC prices.`);
}

function assertChronological(candles: readonly DailyCandle[]): void {
  let previous = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < candles.length; index += 1) {
    assertCandle(candles[index]!, index);
    const current = Date.parse(candles[index]!.at);
    if (current <= previous) throw new Error('Outcome candles must be strictly chronological.');
    previous = current;
  }
}

/** Reserve the round-trip charge on the leveraged notional, rounded once in cents. */
export function reservedCostCents(
  stake: Money = DAILY_FIVE_RULES.roundStake,
  leverage: number,
): bigint {
  const stakeCents = parseMoney(stake);
  if (stakeCents <= 0n || !Number.isInteger(leverage) || leverage < 1)
    throw new Error('A positive stake and integer leverage are required.');
  return roundQuotient(stakeCents * BigInt(leverage) * DAILY_TOTAL_FEE_BPS, BASIS_POINTS);
}

/** Evaluate the official fixed-point equity formula at one price. */
export function equityAtPrice(
  price: Price,
  entryPrice: Price,
  side: 'long' | 'short',
  leverage: number,
  stake: Money = DAILY_FIVE_RULES.roundStake,
): Money {
  const priceUnits = assertPositivePrice(price, 'Price');
  const entryUnits = assertPositivePrice(entryPrice, 'Entry price');
  const stakeCents = parseMoney(stake);
  if (stakeCents <= 0n || !Number.isInteger(leverage) || leverage < 1)
    throw new Error('A positive stake and integer leverage are required.');
  const notionalCents = stakeCents * BigInt(leverage);
  const reserved = reservedCostCents(stake, leverage);
  const direction = side === 'long' ? 1n : -1n;
  const numerator =
    (stakeCents - reserved) * entryUnits + direction * notionalCents * (priceUnits - entryUnits);
  const equity = roundQuotient(numerator, entryUnits);
  return moneyFromCents(equity < 0n ? 0n : equity);
}

/** Formats a cent delta as a signed percentage with two decimal places. */
export function formatReturnPct(equity: bigint, stake: bigint): string {
  const units = roundQuotient((equity - stake) * 10_000n, stake);
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  return `${negative ? '-' : ''}${(absolute / 100n).toString()}.${(absolute % 100n)
    .toString()
    .padStart(2, '0')}`;
}

/** Find the first candle extreme that reaches or crosses zero equity. */
export function findLiquidation(position: DailyPosition): DailyLiquidation | null {
  const stake = position.stake ?? DAILY_FIVE_RULES.roundStake;
  const firstCandle = position.candles[0];
  const entryPrice = position.entryPrice ?? firstCandle?.open;
  if (!entryPrice) throw new Error('An outcome window needs an entry price or a first candle.');
  if (position.candles.length === 0)
    throw new Error('An outcome window needs at least one candle.');
  if (position.entryPrice && position.entryPrice !== firstCandle!.open)
    throw new Error('The entry price must be the first outcome candle open.');
  assertChronological(position.candles);
  assertPositivePrice(entryPrice, 'Entry price');
  if (
    !Number.isInteger(position.leverage) ||
    position.leverage < DAILY_FIVE_RULES.minLeverage ||
    position.leverage > DAILY_FIVE_RULES.maxLeverage
  )
    throw new Error('Leverage must be an integer from 1× through 100×.');

  const probe = position.side === 'long' ? 'low' : 'high';
  for (const [candleIndex, candle] of position.candles.entries()) {
    const probePrice = candle[probe];
    const equity = equityAtPrice(probePrice, entryPrice, position.side, position.leverage, stake);
    if (parseMoney(equity) <= 0n)
      return { candleIndex, at: candle.at, price: probePrice, equity: moneyFromCents(0n) };
  }
  return null;
}

/** Settle a long or short position against real candle extremes and final close. */
export function evaluatePosition(position: DailyPosition): DailyPositionResult {
  const stake = position.stake ?? DAILY_FIVE_RULES.roundStake;
  if (position.candles.length === 0)
    throw new Error('An outcome window needs at least one candle.');
  assertChronological(position.candles);
  const first = position.candles[0]!;
  const entryPrice = position.entryPrice ?? first.open;
  if (position.entryPrice && position.entryPrice !== first.open)
    throw new Error('The entry price must be the first outcome candle open.');
  assertPositivePrice(entryPrice, 'Entry price');
  const liquidation = findLiquidation({ ...position, stake, entryPrice });
  if (liquidation)
    return {
      entryPrice,
      exitPrice: liquidation.price,
      endingEquity: moneyFromCents(0n),
      returnPct: '-100.00',
      liquidated: true,
      liquidation,
    };
  const lastClosed = [...position.candles].reverse().find((candle) => candle.closed !== false);
  if (!lastClosed) throw new Error('An outcome window needs a closed final candle.');
  const endingEquity = equityAtPrice(
    lastClosed.close,
    entryPrice,
    position.side,
    position.leverage,
    stake,
  );
  const stakeCents = parseMoney(stake);
  return {
    entryPrice,
    exitPrice: lastClosed.close,
    endingEquity,
    returnPct: formatReturnPct(parseMoney(endingEquity), stakeCents),
    liquidated: parseMoney(endingEquity) <= 0n,
    liquidation: null,
  };
}

/** The cash ticket keeps its isolated stake untouched and has no market prices. */
export function evaluateCash(stake: Money = DAILY_FIVE_RULES.roundStake): DailyPositionResult {
  const stakeCents = parseMoney(stake);
  if (stakeCents <= 0n) throw new Error('A cash ticket needs a positive stake.');
  return {
    entryPrice: priceFromUnits(1n),
    exitPrice: priceFromUnits(1n),
    endingEquity: stake,
    returnPct: '0.00',
    liquidated: false,
    liquidation: null,
  };
}
