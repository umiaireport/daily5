import type {
  EvidenceCategory,
  PreDecisionChartPoint,
  RevealedClue,
} from '../../../shared/evidence.js';
import { priceFromUnits } from '../../../shared/game-rules.js';

interface Observation {
  readonly at: string;
  readonly buyer: number;
  readonly seller: number;
  readonly side: 'buy' | 'sell';
  readonly units: number;
  readonly value: number;
}

/** Fictional price levels keep the five candidates readable and materially distinct. */
export function syntheticPriceBaseUnits(asset: number, round: number): bigint {
  const levels = [2_400_000n, 182_000_000n, 1_460_000_000n, 23_600_000_000n, 74_000_000n];
  return levels[asset % levels.length]! + BigInt(round * (asset + 1) * 10_000);
}

/** Fictional five-minute observations, independent of all private outcome candles. */
export function syntheticObservations(round: number, asset: number, cutoffMs: number) {
  const pattern = (asset + round - 1) % 5;
  const chart: PreDecisionChartPoint[] = [];
  const trades: Observation[] = [];
  for (let index = 0; index < 72; index++) {
    const t = index / 71;
    const shapes = [
      650 * t + 95 * Math.sin(t * 20),
      -580 * t + 110 * Math.sin(t * 16),
      -600 * Math.sin(t * Math.PI) + 120 * t,
      700 * Math.sin(t * Math.PI) - 140 * t,
      240 * Math.sin(t * 26) + 80 * Math.sin(t * 53),
    ];
    const bps = Math.round(
      shapes[pattern]! * (1 + round * 0.08) +
        (index ? ((index * 17 + round * 23 + asset * 11) % 57) - 28 : 0),
    );
    const base = syntheticPriceBaseUnits(asset, round);
    const value = priceFromUnits(base + (base * BigInt(bps)) / 10_000n);
    const at = new Date(cutoffMs - (72 - index) * 300_000).toISOString();
    chart.push({ at, value });
    const count = 3 + ((index + asset + round) % 6);
    for (let trade = 0; trade < count; trade++) {
      const key = index * 7 + trade * 11 + asset * 19 + round * 13;
      const side = key % 100 < 32 + ((asset * 13 + round * 7) % 42) ? 'buy' : 'sell';
      const units = key % (5 + asset) === 0 ? 40_000 + (key % 8_000) : 600 + (key % 2_800);
      trades.push({
        at,
        side,
        units,
        value: units * Number(value),
        buyer: key % (18 + asset * 9),
        seller: key % (24 + round * 5),
      });
    }
  }
  return { chart, trades };
}

/** Summarizes only observed pre-cutoff activity; never reads settlement or private identities. */
export function observationClue(
  category: EvidenceCategory,
  observations: ReturnType<typeof syntheticObservations>,
): Pick<RevealedClue, 'factualHeadline' | 'metrics' | 'interpretation'> {
  const { chart, trades } = observations;
  const buys = trades.filter((trade) => trade.side === 'buy');
  const sells = trades.filter((trade) => trade.side === 'sell');
  const sum = (items: readonly Observation[]) =>
    items.reduce((total, trade) => total + trade.value, 0);
  const buyValue = sum(buys);
  const sellValue = sum(sells);
  const total = buyValue + sellValue;
  const money = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
  const window = {
    startAt: chart[0]!.at,
    endAt: chart.at(-1)!.at,
    label: 'Six hour observed window',
  } as const;
  const metric = (
    label: string,
    numericValue: number,
    value: string,
    unit: 'usd' | 'percent' | 'count' | 'ratio' | 'units',
    baseline?: { label: string; value: string; numericValue: number },
  ) => ({ label, value, numericValue, unit, window, ...(baseline ? { baseline } : {}) });
  const prices = chart.map((point) => Number(point.value));
  const change = (prices.at(-1)! / prices[0]! - 1) * 100;
  const pressure = buyValue >= sellValue ? 'Buying' : 'Selling';
  const lastHour = trades.filter((trade) => trade.at >= chart[60]!.at);
  const earlier = trades.filter((trade) => trade.at < chart[60]!.at);
  const baseline = sum(earlier) / 5;
  const earlierBuys = sum(earlier.filter((trade) => trade.side === 'buy')) / 5;
  const earlierSells = sum(earlier.filter((trade) => trade.side === 'sell')) / 5;
  const priorChange = (prices[59]! / prices[0]! - 1) * 100;
  const buyByWallet = new Map<number, number>();
  for (const trade of buys)
    buyByWallet.set(trade.buyer, (buyByWallet.get(trade.buyer) ?? 0) + trade.value);
  const largest = Math.max(0, ...buyByWallet.values());
  const holdingsGrowth =
    buys.reduce((n, trade) => n + trade.units, 0) - sells.reduce((n, trade) => n + trade.units, 0);
  const recentNet =
    sum(lastHour.filter((trade) => trade.side === 'buy')) -
    sum(lastHour.filter((trade) => trade.side === 'sell'));
  switch (category) {
    case 'flow':
      return {
        factualHeadline: `${buys.length} buy trades · ${sells.length} sell trades`,
        metrics: [
          metric('Buy volume', buyValue, money(buyValue), 'usd', {
            label: 'Earlier hourly average',
            value: money(earlierBuys),
            numericValue: earlierBuys,
          }),
          metric('Sell volume', sellValue, money(sellValue), 'usd', {
            label: 'Earlier hourly average',
            value: money(earlierSells),
            numericValue: earlierSells,
          }),
        ],
        interpretation: `${pressure} led by ${money(Math.abs(buyValue - sellValue))} over six hours. The final hour recorded ${money(Math.abs(recentNet))} net ${recentNet >= 0 ? 'buying' : 'selling'}. This measures executed flow, not a prediction.`,
      };
    case 'crowd':
      return {
        factualHeadline: 'Count the participants behind the move.',
        metrics: [
          metric(
            'Distinct buyers',
            new Set(buys.map((trade) => trade.buyer)).size,
            String(new Set(buys.map((trade) => trade.buyer)).size),
            'count',
          ),
          metric(
            'Distinct sellers',
            new Set(sells.map((trade) => trade.seller)).size,
            String(new Set(sells.map((trade) => trade.seller)).size),
            'count',
          ),
        ],
        interpretation: `${lastHour.length} trades occurred in the final hour, versus ${(earlier.length / 5).toFixed(1)} per hour earlier. More wallets can indicate broader participation; wallet counts do not establish independent owners.`,
      };
    case 'whale-footprint':
      return {
        factualHeadline:
          holdingsGrowth >= 0
            ? 'The observed cohort accumulated tokens.'
            : 'The observed cohort reduced its position.',
        metrics: [
          metric(
            'Largest buyer share',
            buyValue ? (largest / buyValue) * 100 : 0,
            `${buyValue ? ((largest / buyValue) * 100).toFixed(1) : '0.0'}%`,
            'percent',
          ),
          metric(
            'Net position growth',
            holdingsGrowth,
            `${holdingsGrowth > 0 ? '+' : ''}${holdingsGrowth.toLocaleString('en-US')} tokens`,
            'units',
          ),
        ],
        interpretation: `The largest buyer accounted for ${money(largest)} of buying. Position growth is buys minus sells within the observed cohort over six hours, not total circulating holdings. Concentrated accumulation may indicate a large participant; it does not prove coordination.`,
      };
    case 'volume':
      return {
        factualHeadline: 'Compare the last hour with the earlier baseline.',
        metrics: [
          metric('Last-hour volume', sum(lastHour), money(sum(lastHour)), 'usd', {
            label: 'Earlier hourly average',
            value: money(baseline),
            numericValue: baseline,
          }),
          metric(
            'Vs. earlier hourly average',
            baseline ? sum(lastHour) / baseline : 0,
            `${baseline ? (sum(lastHour) / baseline).toFixed(2) : 'Unavailable'}×`,
            'ratio',
          ),
        ],
        interpretation: `The first five hours averaged ${money(baseline)} per hour. Price changed ${change.toFixed(2)}% across all six hours. Higher activity supports participation, but buying and selling both contribute to volume.`,
      };
    case 'volatility':
      return {
        factualHeadline: 'The path matters as much as the final price.',
        metrics: [
          metric(
            'Observed close range',
            ((Math.max(...prices) - Math.min(...prices)) / prices[0]!) * 100,
            `${(((Math.max(...prices) - Math.min(...prices)) / prices[0]!) * 100).toFixed(2)}%`,
            'percent',
          ),
          metric(
            'Largest 5-minute close move',
            Math.max(
              ...prices.slice(1).map((value, index) => Math.abs(value / prices[index]! - 1) * 100),
            ),
            `${Math.max(...prices.slice(1).map((value, index) => Math.abs(value / prices[index]! - 1) * 100)).toFixed(2)}%`,
            'percent',
          ),
        ],
        interpretation:
          'These 72 five-minute observations cover six hours before the cutoff. Wide swings make leveraged positions more fragile. Close-to-close movement omits intraperiod extremes and cannot predict liquidation.',
      };
    case 'absorption':
      return {
        factualHeadline: `${pressure} pressure met a ${change.toFixed(2)}% price move.`,
        metrics: [
          metric(
            'Buy share of volume',
            total ? (buyValue / total) * 100 : 0,
            `${total ? ((buyValue / total) * 100).toFixed(1) : '0.0'}%`,
            'percent',
          ),
          metric('Price change', change, `${change.toFixed(2)}%`, 'percent', {
            label: 'Earlier five-hour change',
            value: `${priorChange.toFixed(2)}%`,
            numericValue: priorChange,
          }),
        ],
        interpretation: `Net flow was ${money(buyValue - sellValue)}. Strong flow with little price progress can suggest offsetting liquidity; this is an interpretation of observed flow and price, not proof of a hidden buyer or a guaranteed reversal.`,
      };
  }
}
