import type { SyntheticAsset, SyntheticScenario } from '../../../fixtures/synthetic/scenarios.js';
import {
  EVIDENCE_CATEGORIES,
  type EvidenceAttribution,
  type EvidenceCategory,
  type PublicAssetEvidence,
  type RevealedClue,
} from '../../../shared/evidence.js';
import { price, type DailyFiveV2Rules, type Price } from '../../../shared/game-rules.js';
import { compileDailyCase, toPublicAssetEvidence } from '../../evidence/compiler.js';
import { normalizeCandles, normalizeTrades } from '../../evidence/normalize.js';
import type {
  CompiledDailyCase,
  CoverageRecord,
  NormalizedCandle,
  NormalizedTrade,
} from '../../evidence/types.js';
import { ProviderError, type Operation, type Schema } from '../../nansen/client.js';
import type {
  DailyFiveCasePack,
  DailyFivePrivateCandidate,
  DailyFivePrivateRound,
} from './types.js';
import type { DailyFivePublic, DailyRoundPublic } from '../../../shared/daily-five.js';
import type { DailyCandle } from './settlement.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const SOURCE_KIND = 'historical-reconstructed' as const;

const looseCandleResponse: Schema<unknown> = {
  parse(value: unknown) {
    if (!value || typeof value !== 'object') throw new Error('Nansen OHLCV response is invalid.');
    const row = value as { data?: unknown; tokens?: unknown };
    const data = Array.isArray(row.data)
      ? row.data.filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object'),
        )
      : undefined;
    const tokens = Array.isArray(row.tokens)
      ? row.tokens.filter(
          (item): item is { token_address?: string; data: Record<string, unknown>[] } =>
            Boolean(
              item && typeof item === 'object' && Array.isArray((item as { data?: unknown }).data),
            ),
        )
      : undefined;
    if (!data?.length && !tokens?.some((item) => item.data.length))
      throw new Error('Nansen OHLCV response contains no candles.');
    return { ...row, data, tokens };
  },
};

interface LooseTradeResponse {
  readonly data: Record<string, unknown>[];
  readonly truncated?: boolean;
  readonly warnings?: string[];
  readonly pagination?: { readonly is_last_page?: boolean };
}

const looseTradeResponse: Schema<LooseTradeResponse> = {
  parse(value: unknown) {
    if (!value || typeof value !== 'object')
      throw new Error('Nansen DEX trade response is invalid.');
    const row = value as {
      data?: unknown;
      truncated?: unknown;
      warnings?: unknown;
      pagination?: unknown;
    };
    const data = Array.isArray(row.data)
      ? row.data.filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object'),
        )
      : [];
    return {
      data,
      ...(row.truncated === true ? { truncated: true } : {}),
      ...(Array.isArray(row.warnings)
        ? { warnings: row.warnings.filter((item): item is string => typeof item === 'string') }
        : {}),
      ...(row.pagination && typeof row.pagination === 'object'
        ? {
            pagination: {
              ...(typeof (row.pagination as { is_last_page?: unknown }).is_last_page === 'boolean'
                ? { is_last_page: (row.pagination as { is_last_page: boolean }).is_last_page }
                : {}),
            },
          }
        : {}),
    };
  },
};

const passThrough: Schema<unknown> = { parse: (value) => value };

function rawCandleNumber(row: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function repairCandleRow(
  value: unknown,
): { readonly value: Record<string, unknown>; readonly repaired: boolean } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const open = rawCandleNumber(row, ['open', 'open_price']);
  const high = rawCandleNumber(row, ['high', 'high_price']);
  const low = rawCandleNumber(row, ['low', 'low_price']);
  const close = rawCandleNumber(row, ['close', 'close_price']);
  if (![open, high, low, close].every((item) => Number.isFinite(item) && item > 0)) return null;
  const repairedHigh = Math.max(high, open, close);
  const repairedLow = Math.min(low, open, close);
  const repaired = repairedHigh !== high || repairedLow !== low;
  return {
    value: repaired ? { ...row, high: repairedHigh, low: repairedLow } : row,
    repaired,
  };
}

function sanitizeCandlePayload(value: unknown): {
  value: unknown;
  dropped: number;
  repaired: number;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { value, dropped: 0, repaired: 0 };
  const row = value as Record<string, unknown>;
  if (Array.isArray(row.data)) {
    let dropped = 0;
    let repaired = 0;
    const data = row.data.flatMap((item) => {
      const result = repairCandleRow(item);
      if (!result) {
        dropped += 1;
        return [];
      }
      if (result.repaired) repaired += 1;
      return [result.value];
    });
    return { value: { ...row, data }, dropped, repaired };
  }
  if (Array.isArray(row.tokens)) {
    let dropped = 0;
    let repaired = 0;
    const tokens = row.tokens.map((token) => {
      if (!token || typeof token !== 'object' || Array.isArray(token)) return token;
      const tokenRow = token as Record<string, unknown>;
      if (!Array.isArray(tokenRow.data)) return token;
      const data = tokenRow.data.flatMap((item) => {
        const result = repairCandleRow(item);
        if (!result) {
          dropped += 1;
          return [];
        }
        if (result.repaired) repaired += 1;
        return [result.value];
      });
      return { ...tokenRow, data };
    });
    return { value: { ...row, tokens }, dropped, repaired };
  }
  return { value, dropped: 0, repaired: 0 };
}

export interface HistoricalDailyNansenClient {
  request<T>(
    operation: Operation,
    body: unknown,
    requestSchema: Schema<unknown>,
    responseSchema: Schema<T>,
  ): Promise<{ data: T; cached: boolean }>;
}

const attribution: readonly EvidenceAttribution[] = [
  {
    label: 'Nansen API · TGM OHLCV and DEX trades',
    sourceKind: SOURCE_KIND,
    url: 'https://docs.nansen.ai/api/token-god-mode/price-ohlcv',
  },
  {
    label: 'Nansen API · TGM DEX trades with Whale filter',
    sourceKind: SOURCE_KIND,
    url: 'https://docs.nansen.ai/api/token-god-mode/dex-trades',
  },
];

function fixedPrice(value: number): Price {
  return price(Math.max(value, 0.00000001).toFixed(8));
}

function sortByTime<T extends { at: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function rawTimestamp(row: Record<string, unknown>): number {
  const value = row.block_timestamp ?? row.timestamp ?? row.at ?? row.date;
  const parsed = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(parsed)
    ? Math.abs(parsed) < 1_000_000_000_000
      ? parsed * 1_000
      : parsed
    : NaN;
}

function traderLabel(row: Record<string, unknown>): string {
  return String(row.trader_address_label ?? row.address_label ?? '').toLowerCase();
}

function isSmartMoney(row: Record<string, unknown>): boolean {
  const label = traderLabel(row);
  return ['fund', 'smart trader', '30d smart trader', '90d smart trader', '180d smart trader'].some(
    (value) => label.includes(value),
  );
}

function isWhaleLabel(row: Record<string, unknown>): boolean {
  return traderLabel(row).includes('whale');
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tradeValue(row: Record<string, unknown>): number {
  return numberValue(
    row.estimated_value_usd ?? row.value_usd ?? row.usd_value ?? row.trade_value_usd,
  );
}

function tradeId(row: Record<string, unknown>): string {
  return String(row.transaction_hash ?? row.trader_address ?? '').trim();
}

function smartMoneyClue(
  compiled: CompiledDailyCase,
  rawTrades: readonly Record<string, unknown>[],
  trades: readonly NormalizedTrade[],
  rawWhaleTrades: readonly Record<string, unknown>[],
): RevealedClue {
  const whaleRows = rawWhaleTrades.length ? rawWhaleTrades : rawTrades.filter(isWhaleLabel);
  const smartRows = rawTrades.filter(isSmartMoney);
  const whaleScaleRows = rawTrades.filter((row) => tradeValue(row) >= 100_000);
  const largestValue = Math.max(0, ...rawTrades.map(tradeValue));
  const largestRows =
    largestValue > 0 ? rawTrades.filter((row) => tradeValue(row) === largestValue) : [];
  const focusRows = whaleRows.length
    ? whaleRows
    : smartRows.length
      ? smartRows
      : whaleScaleRows.length
        ? whaleScaleRows
        : largestRows;
  const focusTrades = whaleRows.length
    ? normalizeTrades({ data: whaleRows })
    : (() => {
        const focusIds = new Set(focusRows.map(tradeId).filter(Boolean));
        return trades.filter((trade) => trade.sourceId && focusIds.has(trade.sourceId));
      })();
  const buy = focusTrades
    .filter((trade) => trade.side === 'buy')
    .reduce((sum, trade) => sum + (trade.valueUsd ?? 0), 0);
  const sell = focusTrades
    .filter((trade) => trade.side === 'sell')
    .reduce((sum, trade) => sum + (trade.valueUsd ?? 0), 0);
  const net = buy - sell;
  const observedLabels = [...new Set(whaleRows.map(traderLabel).filter(Boolean))]
    .slice(0, 3)
    .join(', ');
  const label = whaleRows.length
    ? `${whaleRows.length} Nansen Whale-filtered trades observed`
    : smartRows.length
      ? `${smartRows.length} labeled smart-money trades observed`
      : whaleScaleRows.length
        ? `${whaleScaleRows.length} whale-scale trades observed`
        : largestRows.length
          ? `${largestRows.length} largest observed trade signal${largestRows.length === 1 ? '' : 's'} returned`
          : 'No provider trade signal returned';
  const interpretation = whaleRows.length
    ? `Nansen's historical Whale filter returned ${whaleRows.length} pre-cutoff DEX trades${observedLabels ? ` (${observedLabels})` : ''}. The measured whale sample contained $${buy.toLocaleString('en-US', { maximumFractionDigits: 0 })} of buys and $${sell.toLocaleString('en-US', { maximumFractionDigits: 0 })} of sells.`
    : smartRows.length
      ? `Nansen labeled ${smartRows.length} pre-cutoff DEX trades as Fund or Smart Trader activity. The measured sample contained $${buy.toLocaleString('en-US', { maximumFractionDigits: 0 })} of buys and $${sell.toLocaleString('en-US', { maximumFractionDigits: 0 })} of sells.`
      : whaleScaleRows.length
        ? `No labeled Whale or Smart Trader row was returned, but ${whaleScaleRows.length} observed DEX trades met the $100,000 whale-scale measurement threshold. This is trade-size evidence, not an identity claim.`
        : largestRows.length
          ? `Nansen returned no Whale, Fund, or Smart Trader label and no $100,000 trade in this window. The clue uses the largest returned DEX trade as a weak comparison signal; it is not evidence of a whale identity.`
          : 'Nansen returned no provider trade signal in this pre-decision window. That is an absence of returned evidence, not proof that no whale acted.';
  return {
    clueId: `${compiled.caseId}:whale-footprint`,
    category: 'whale-footprint',
    title: 'Whale footprint',
    factualHeadline: label,
    metrics: [
      {
        label: whaleRows.length
          ? 'Whale net flow'
          : smartRows.length
            ? 'Smart-money net flow'
            : whaleScaleRows.length
              ? 'Whale-scale net flow'
              : 'Largest trade value',
        value: `${net >= 0 ? '+' : '−'}$${Math.abs(net).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      },
      {
        label: whaleRows.length
          ? 'Whale-filtered trades'
          : smartRows.length
            ? 'Labeled trades'
            : whaleScaleRows.length
              ? 'Whale-scale trades'
              : 'Largest observed trades',
        value: String(focusRows.length),
      },
    ],
    interpretation,
    limitation:
      'Nansen labels cover the returned DEX-trade sample only; they are not a complete ownership census or a prediction.',
    evidenceCutoff: compiled.cutoffAt,
    scope: { kind: 'asset', assetId: compiled.caseId },
    roundIndex: compiled.roundIndex,
    sourceKind: SOURCE_KIND,
    coverage: compiled.coverage,
    attribution,
  };
}

function coverage(
  startAt: string,
  cutoffAt: string,
  observedAt: string,
  preDecisionCandles: readonly NormalizedCandle[],
  outcomeCandles: readonly NormalizedCandle[],
  preDecisionTrades: readonly NormalizedTrade[],
  truncated: boolean,
  warnings: readonly string[],
): CoverageRecord {
  const missingMeasurements = [
    ...(preDecisionCandles.length < 2 ? ['pre-decision-candles'] : []),
    ...(outcomeCandles.length < 2 ? ['outcome-candles'] : []),
    ...(preDecisionTrades.length < 1 ? ['pre-decision-trades'] : []),
  ];
  const complete = !truncated && missingMeasurements.length === 0;
  return {
    status: complete ? 'complete' : 'partial',
    description: complete
      ? 'Nansen returned complete historical OHLCV plus bounded round-scoped DEX trades and a Whale-filter sample for this asset.'
      : 'Nansen returned an incomplete historical window; this asset cannot be published.',
    observedAt,
    startAt,
    cutoffAt,
    complete,
    truncated,
    warnings,
    missingAssets: [],
    missingMeasurements,
    // Provider rows that cannot be measured are omitted or range-repaired
    // above; preserve the real timestamps and do not claim a regular interval
    // across an omitted row.
    expectedCandleIntervalMinutes: null,
  };
}

function toDailyCandle(candle: NormalizedCandle): DailyCandle {
  return {
    at: candle.at,
    open: fixedPrice(candle.open),
    high: fixedPrice(candle.high),
    low: fixedPrice(candle.low),
    close: fixedPrice(candle.close),
    closed: candle.closed,
  };
}

function privateClues(
  compiled: CompiledDailyCase,
  smartClue: RevealedClue,
): readonly RevealedClue[] {
  return EVIDENCE_CATEGORIES.map((category) => {
    if (category === 'whale-footprint') return smartClue;
    const clue = compiled.clues[category];
    return {
      ...clue,
      clueId: `${compiled.caseId}:${category}`,
      title: category.replace('-', ' '),
      scope: { kind: 'asset' as const, assetId: compiled.caseId },
      roundIndex: compiled.roundIndex,
    };
  });
}

interface ProviderWindow {
  readonly candles: unknown;
  readonly candleWarnings?: readonly string[];
}

type ProviderTradeWindow = LooseTradeResponse;

async function fetchAssetWindow(
  client: HistoricalDailyNansenClient,
  asset: SyntheticAsset,
  dayStart: number,
  rules: DailyFiveV2Rules,
): Promise<ProviderWindow> {
  if (!asset.providerChain || !asset.providerTokenAddress)
    throw new Error(`Provider references are missing for ${asset.symbol}.`);
  const earliest = dayStart - (rules.totalRounds - 1) * DAY - 28 * HOUR;
  const date = { from: new Date(earliest).toISOString(), to: new Date(dayStart).toISOString() };
  const response = await client.request(
    'liveCandles',
    {
      chain: asset.providerChain,
      token_address: asset.providerTokenAddress,
      date,
      timeframe: '1h',
    },
    passThrough,
    looseCandleResponse,
  );
  const sanitizedCandles = sanitizeCandlePayload(response.data);
  return {
    candles: sanitizedCandles.value,
    candleWarnings: [
      ...(sanitizedCandles.repaired > 0
        ? [
            `Nansen returned ${sanitizedCandles.repaired} inconsistent OHLCV ranges; high/low were bounded to the provider's open/close values.`,
          ]
        : []),
      ...(sanitizedCandles.dropped > 0
        ? [`Nansen omitted ${sanitizedCandles.dropped} OHLCV rows without usable prices.`]
        : []),
    ],
  };
}

async function fetchAssetTrades(
  client: HistoricalDailyNansenClient,
  asset: SyntheticAsset,
  evidenceStartAt: string,
  cutoffAt: string,
): Promise<ProviderTradeWindow> {
  if (!asset.providerChain || !asset.providerTokenAddress)
    throw new Error(`Provider references are missing for ${asset.symbol}.`);
  const response = await client.request(
    'liveTrades',
    {
      chain: asset.providerChain,
      token_address: asset.providerTokenAddress,
      date: { from: evidenceStartAt, to: cutoffAt },
      // This base TGM endpoint returns the trader_address_label field used by
      // the smart-money clue. Restricting the date to this round prevents a
      // high-volume token's first page from consuming the whole five-day pack.
      only_smart_money: false,
      pagination: { page: 1, per_page: 1000 },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }],
    },
    passThrough,
    looseTradeResponse,
  );
  return {
    data: response.data.data,
    warnings: [
      ...(response.data.warnings ?? []),
      ...(response.data.truncated || response.data.pagination?.is_last_page === false
        ? ['Nansen returned a bounded DEX-trade sample; trade evidence is not exhaustive.']
        : []),
    ],
  };
}

async function fetchWhaleTrades(
  client: HistoricalDailyNansenClient,
  asset: SyntheticAsset,
  evidenceStartAt: string,
  cutoffAt: string,
): Promise<ProviderTradeWindow> {
  if (!asset.providerChain || !asset.providerTokenAddress)
    throw new Error(`Provider references are missing for ${asset.symbol}.`);
  const response = await client.request(
    'liveTrades',
    {
      chain: asset.providerChain,
      token_address: asset.providerTokenAddress,
      date: { from: evidenceStartAt, to: cutoffAt },
      // In TGM, the Whale filter is the historical signal. The returned
      // trader_address_label may be an entity label such as Token Millionaire,
      // not the literal string "Whale".
      only_smart_money: false,
      filters: { include_smart_money_labels: ['Whale'] },
      pagination: { page: 1, per_page: 1000 },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }],
    },
    passThrough,
    looseTradeResponse,
  );
  return {
    data: response.data.data,
    warnings: [
      ...(response.data.warnings ?? []),
      ...(response.data.truncated || response.data.pagination?.is_last_page === false
        ? [
            'Nansen returned a bounded Whale-filtered DEX-trade sample; whale evidence is not exhaustive.',
          ]
        : []),
    ],
  };
}

interface SelectedProviderAsset {
  readonly asset: SyntheticAsset;
  readonly providerWindow: ProviderWindow;
  readonly trades: ProviderTradeWindow;
  readonly whaleTrades: ProviderTradeWindow;
  readonly whaleSignalScore: number;
}

function hasRoundCandleCoverage(
  window: ProviderWindow,
  asset: SyntheticAsset,
  roundIndex: number,
  dayStart: number,
  rules: DailyFiveV2Rules,
): boolean {
  if (!asset.providerTokenAddress) return false;
  try {
    const candles = sortByTime(
      normalizeCandles(window.candles, { tokenAddress: asset.providerTokenAddress }),
    );
    const windowEnd = dayStart - (rules.totalRounds - roundIndex) * DAY;
    const entryAt = windowEnd - 4 * HOUR;
    const evidenceStartAt = entryAt - 24 * HOUR;
    const cutoffAt = entryAt;
    const preDecision = candles.filter((candle) => {
      const at = Date.parse(candle.at);
      return at >= evidenceStartAt && at < cutoffAt;
    });
    const outcome = candles.filter((candle) => {
      const at = Date.parse(candle.at);
      return at >= entryAt && at < windowEnd;
    });
    return preDecision.length >= 2 && outcome.length >= 2;
  } catch {
    return false;
  }
}

function whaleSignalScore(whaleTrades: ProviderTradeWindow, trades: ProviderTradeWindow): number {
  const exactWhaleCount = whaleTrades.data.length;
  const smartCount = trades.data.filter(isSmartMoney).length;
  const largestTrade = Math.max(0, ...trades.data.map(tradeValue));
  if (exactWhaleCount > 0)
    return 3_000_000_000_000 + exactWhaleCount * 1_000_000_000 + largestTrade;
  if (smartCount > 0) return 2_000_000_000_000 + smartCount * 1_000_000_000 + largestTrade;
  return largestTrade;
}

function providerAssetKey(asset: SyntheticAsset): string {
  return `${asset.providerChain ?? ''}:${asset.providerTokenAddress ?? ''}`.toLowerCase();
}

async function selectRoundAssets(
  client: HistoricalDailyNansenClient,
  assets: readonly SyntheticAsset[],
  startIndex: number,
  roundIndex: number,
  dayStart: number,
  rules: DailyFiveV2Rules,
  usedAssetKeys: ReadonlySet<string>,
): Promise<{ readonly selected: readonly SelectedProviderAsset[]; readonly nextIndex: number }> {
  let index = startIndex;
  const pool: SelectedProviderAsset[] = [];
  const poolSize = rules.candidatesPerRound + 3;
  const scannedIndexes = new Set<number>();

  const inspect = async (candidateIndex: number) => {
    if (scannedIndexes.has(candidateIndex)) return;
    scannedIndexes.add(candidateIndex);
    const asset = assets[candidateIndex]!;
    if (usedAssetKeys.has(providerAssetKey(asset))) return;
    const windowEnd = dayStart - (rules.totalRounds - roundIndex) * DAY;
    const cutoffAt = new Date(windowEnd - 4 * HOUR).toISOString();
    const evidenceStartAt = new Date(windowEnd - 4 * HOUR - 24 * HOUR).toISOString();
    const whaleTrades = await fetchWhaleTrades(client, asset, evidenceStartAt, cutoffAt);
    const trades = await fetchAssetTrades(client, asset, evidenceStartAt, cutoffAt);
    const usableTrades = trades.data.length > 0 ? trades : whaleTrades;
    if (usableTrades.data.length === 0) return;
    let providerWindow: ProviderWindow;
    try {
      providerWindow = await fetchAssetWindow(client, asset, dayStart, rules);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      return;
    }
    if (!hasRoundCandleCoverage(providerWindow, asset, roundIndex, dayStart, rules)) return;
    pool.push({
      asset,
      providerWindow,
      trades: usableTrades,
      whaleTrades,
      whaleSignalScore: whaleSignalScore(whaleTrades, usableTrades),
    });
  };

  while (index < assets.length && pool.length < poolSize) {
    await inspect(index);
    index += 1;
  }

  // A sequential slice can run out of usable historical coverage even though
  // earlier unselected controls have good data for this round. Reuse only
  // those unselected real assets as a bounded fallback; selected assets remain
  // reserved so the published five pools still contain 25 unique assets.
  if (pool.length < rules.candidatesPerRound) {
    for (let candidateIndex = 0; candidateIndex < assets.length; candidateIndex += 1) {
      if (pool.length >= poolSize) break;
      await inspect(candidateIndex);
    }
  }
  if (pool.length < rules.candidatesPerRound)
    throw new Error(
      `Nansen could not form round ${roundIndex} with ${rules.candidatesPerRound} real provider assets.`,
    );
  const target = pool.reduce((best, candidate) =>
    candidate.whaleSignalScore > best.whaleSignalScore ? candidate : best,
  );
  if (target.whaleSignalScore <= 0)
    throw new Error(`Nansen returned no provider trade signal for round ${roundIndex}.`);
  const controls = pool
    .filter((candidate) => candidate !== target)
    .sort((left, right) => left.whaleSignalScore - right.whaleSignalScore)
    .slice(0, rules.candidatesPerRound - 1);
  const selected = [target, ...controls];
  const offset = (Math.floor(dayStart / DAY) + roundIndex * 2) % selected.length;
  return {
    selected: selected.map((_, itemIndex) => selected[(itemIndex + offset) % selected.length]!),
    nextIndex: index,
  };
}

async function collectAsset(
  client: HistoricalDailyNansenClient,
  asset: SyntheticAsset,
  roundIndex: number,
  dayStart: number,
  rules: DailyFiveV2Rules,
  providerWindow?: ProviderWindow,
  providerTrades?: ProviderTradeWindow,
  providerWhaleTrades?: ProviderTradeWindow,
): Promise<{ publicAsset: PublicAssetEvidence; privateAsset: DailyFivePrivateCandidate }> {
  if (!asset.providerChain || !asset.providerTokenAddress)
    throw new Error(`Provider references are missing for ${asset.symbol}.`);
  const windowEnd = dayStart - (rules.totalRounds - roundIndex) * DAY;
  const entryAtMs = windowEnd - 4 * HOUR;
  const evidenceStartAt = new Date(entryAtMs - 24 * HOUR).toISOString();
  const cutoffAt = new Date(entryAtMs).toISOString();
  const entryAt = cutoffAt;
  const exitAt = new Date(windowEnd).toISOString();
  const window = providerWindow ?? (await fetchAssetWindow(client, asset, dayStart, rules));
  const tradeWindow =
    providerTrades ?? (await fetchAssetTrades(client, asset, evidenceStartAt, cutoffAt));
  const whaleWindow =
    providerWhaleTrades ?? (await fetchWhaleTrades(client, asset, evidenceStartAt, cutoffAt));
  const allCandles = sortByTime(
    normalizeCandles(window.candles, { tokenAddress: asset.providerTokenAddress }),
  );
  const allTrades = sortByTime(normalizeTrades(tradeWindow.data));
  const preDecisionCandles = allCandles.filter(
    (candle) =>
      Date.parse(candle.at) >= Date.parse(evidenceStartAt) &&
      Date.parse(candle.at) < Date.parse(cutoffAt),
  );
  const outcomeCandles = allCandles.filter(
    (candle) =>
      Date.parse(candle.at) >= Date.parse(entryAt) && Date.parse(candle.at) < Date.parse(exitAt),
  );
  const preDecisionTrades = allTrades.filter(
    (trade) =>
      Date.parse(trade.at) >= Date.parse(evidenceStartAt) &&
      Date.parse(trade.at) < Date.parse(cutoffAt),
  );
  const rawPreDecisionTrades = tradeWindow.data
    .filter((row) => {
      const at = rawTimestamp(row);
      return Number.isFinite(at) && at >= Date.parse(evidenceStartAt) && at < Date.parse(cutoffAt);
    })
    .sort((left, right) => rawTimestamp(left) - rawTimestamp(right));
  const observedAt = new Date().toISOString();
  const caseCoverage = coverage(
    evidenceStartAt,
    cutoffAt,
    observedAt,
    preDecisionCandles,
    outcomeCandles,
    preDecisionTrades,
    tradeWindow.truncated === true,
    [
      ...(window.candleWarnings ?? []),
      ...(tradeWindow.warnings ?? []),
      ...(whaleWindow.warnings ?? []),
    ],
  );
  if (!caseCoverage.complete)
    throw new Error(
      `Incomplete Nansen historical coverage for ${asset.symbol}: ${caseCoverage.missingMeasurements.join(', ') || 'provider flagged the window'}.`,
    );
  const compiled = compileDailyCase({
    caseId: `nansen-daily-r${roundIndex}-${asset.providerTokenAddress.slice(-8)}`,
    roundIndex,
    sourceKind: SOURCE_KIND,
    chain: asset.providerChain,
    tokenAddress: asset.providerTokenAddress,
    symbol: asset.symbol,
    name: asset.name,
    evidenceStartAt,
    cutoffAt,
    entryAt,
    exitAt,
    collectionAt: observedAt,
    preDecisionCandles,
    outcomeCandles,
    trades: rawPreDecisionTrades,
    snapshots: [],
    coverage: caseCoverage,
    attribution,
  });
  const rawPreDecisionWhaleTrades = whaleWindow.data
    .filter((row) => {
      const at = rawTimestamp(row);
      return Number.isFinite(at) && at >= Date.parse(evidenceStartAt) && at < Date.parse(cutoffAt);
    })
    .sort((left, right) => rawTimestamp(left) - rawTimestamp(right));
  const smartClue = smartMoneyClue(
    compiled,
    rawPreDecisionTrades,
    preDecisionTrades,
    rawPreDecisionWhaleTrades,
  );
  const publicAsset = toPublicAssetEvidence(
    {
      ...compiled,
      clues: { ...compiled.clues, 'whale-footprint': compiled.clues['whale-footprint'] },
    },
    `Mystery ${String.fromCharCode(64 + ((roundIndex - 1) % rules.candidatesPerRound) + 1)}`,
    0,
  );
  const privateAsset: DailyFivePrivateCandidate = {
    assetId: publicAsset.assetId,
    variantId: `${compiled.caseId}:variant`,
    candles: outcomeCandles.map(toDailyCandle),
    clues: privateClues(compiled, smartClue),
    realAssetKey: `${asset.providerChain}:${asset.providerTokenAddress}`,
    realAssetName: asset.name,
    realAssetSymbol: asset.symbol,
    windowStart: outcomeCandles[0]!.at,
    windowEnd: outcomeCandles.at(-1)!.at,
  };
  return { publicAsset, privateAsset };
}

/**
 * Builds the Daily Five from real provider windows. Each round consumes a new
 * slice of the provider candidate universe and contains one designated asset
 * with the strongest historical Nansen Whale/smart-money/whale-scale signal
 * plus four lower-signal controls.
 */
export async function createHistoricalDailyFiveCasePack(
  dailyId: string,
  dayStart: number,
  rules: DailyFiveV2Rules,
  scenario: SyntheticScenario,
  client: HistoricalDailyNansenClient,
): Promise<DailyFiveCasePack> {
  const assets = scenario.assets.filter(
    (asset) => asset.providerChain && asset.providerTokenAddress,
  );
  if (assets.length < rules.candidatesPerRound * rules.totalRounds)
    throw new Error(
      `Nansen needs at least ${rules.candidatesPerRound * rules.totalRounds} real provider candidates for five fresh pools.`,
    );
  const rounds: DailyRoundPublic[] = [];
  const privateRounds: DailyFivePrivateRound[] = [];
  let candidateIndex = 0;
  const usedAssetKeys = new Set<string>();
  for (let roundIndex = 1; roundIndex <= rules.totalRounds; roundIndex += 1) {
    const selection = await selectRoundAssets(
      client,
      assets,
      candidateIndex,
      roundIndex,
      dayStart,
      rules,
      usedAssetKeys,
    );
    candidateIndex = selection.nextIndex;
    for (const selectedAsset of selection.selected) {
      usedAssetKeys.add(providerAssetKey(selectedAsset.asset));
    }
    const collected = await Promise.all(
      selection.selected.map(async (selectedAsset) => {
        return collectAsset(
          client,
          selectedAsset.asset,
          roundIndex,
          dayStart,
          rules,
          selectedAsset.providerWindow,
          selectedAsset.trades,
          selectedAsset.whaleTrades,
        );
      }),
    );
    const publicAssets = collected.map((item, index) => ({
      ...item.publicAsset,
      attemptAlias: `Mystery ${String.fromCharCode(65 + index)}`,
      colorIndex: index,
    }));
    const privateAssets = collected.map((item, index) => ({
      ...item.privateAsset,
      assetId: publicAssets[index]!.assetId,
      clues: item.privateAsset.clues?.map((clue) => ({
        ...clue,
        scope: { kind: 'asset' as const, assetId: publicAssets[index]!.assetId },
      })),
    }));
    const cutoffAt = publicAssets[0]!.coverage.observedAt
      ? new Date(dayStart - (rules.totalRounds - roundIndex) * DAY - 4 * HOUR).toISOString()
      : new Date(dayStart).toISOString();
    rounds.push({
      roundIndex,
      cutoffAt,
      candidates: publicAssets,
      evidence: {
        status: 'available',
        sourceKind: SOURCE_KIND,
        coverage: publicAssets[0]!.coverage,
      },
      unlocksRemaining: rules.clueUnlocksPerRound,
    });
    privateRounds.push({ roundIndex, candidates: privateAssets });
  }
  const publicChallenge: DailyFivePublic = {
    dailyId,
    rules,
    rounds,
    publishedAt: new Date(dayStart).toISOString(),
  };
  return {
    publicChallenge,
    privateRounds,
    cohort: 'nansen-historical-daily-v3-whale-pools',
  };
}
